import { createClient } from "@supabase/supabase-js";

import {
  LOG_LEVELS,
  chunk,
  finishWorkerRun,
  getEnv,
  getNumberEnv,
  getSupabaseConfig,
  loadWorkerEnv,
  log,
  mapWithConcurrency,
  startWorkerRun,
  withRetry
} from "./worker-utils.js";

loadWorkerEnv(import.meta.url);

/**
 * KeluScore narrative summaries.
 *
 * Calls an OpenAI-compatible chat completions endpoint over plain HTTPS using
 * the global fetch built into Node 22. This is deliberate: adding an SDK to
 * package.json without regenerating package-lock.json breaks "npm ci" on
 * Vercel, and the REST call is a dozen lines. It also means any
 * OpenAI-compatible provider works by changing one env var.
 *
 * Cost control is the whole design here. Summaries are cached in
 * intent_summaries and only regenerated when the score has actually moved or
 * the text has gone stale, and never for more than a capped number of tokens
 * per cycle.
 *
 * Without OPENAI_API_KEY this worker is inert: it logs and exits cleanly. It
 * never writes a placeholder or a fabricated summary.
 */

const WORKER_NAME = "intent-summaries";
const NEWLINE = "\n";
const PROMPT_VERSION = 1;

const POLL_INTERVAL_MS = getNumberEnv("INTENT_SUMMARY_INTERVAL_MS", 6 * 60 * 60 * 1000);
const MAX_TOKENS_PER_CYCLE = getNumberEnv("INTENT_SUMMARY_MAX_TOKENS", 40);
const REGEN_SCORE_DELTA = getNumberEnv("INTENT_SUMMARY_REGEN_DELTA", 5);
const STALE_AFTER_HOURS = getNumberEnv("INTENT_SUMMARY_STALE_HOURS", 168);
const CONCURRENCY = getNumberEnv("INTENT_SUMMARY_CONCURRENCY", 2);
const MAX_OUTPUT_TOKENS = getNumberEnv("INTENT_SUMMARY_OUTPUT_TOKENS", 220);
const REQUEST_TIMEOUT_MS = getNumberEnv("INTENT_SUMMARY_TIMEOUT_MS", 30_000);

const MODEL = getEnv("INTENT_SUMMARY_MODEL", "gpt-4o-mini");
const BASE_URL = getEnv("OPENAI_BASE_URL", "https://api.openai.com/v1");

const SCORE_FIELDS = [
  "token_id",
  "kelu_score",
  "grade",
  "conviction_score",
  "momentum_score",
  "breadth_score",
  "performance_score",
  "freshness_score",
  "marketing_score",
  "community_score",
  "liquidity_score",
  "calls_24h",
  "calls_7d",
  "calls_30d",
  "unique_channels",
  "signals",
  "recommendations",
  "computed_at"
].join(", ");

const SYSTEM_PROMPT = [
  "You write short, factual analyst notes about crypto tokens for a call-tracking product called Kelucalls.",
  "",
  "Hard rules:",
  "- Use ONLY the data provided. Never invent numbers, dates, partnerships, listings or events.",
  "- A null or missing sub-score means the data has not been collected yet. Say it is unavailable. Never describe it as zero, weak or bad.",
  "- Never predict prices, never give financial advice, never say buy or sell.",
  "- Describe caller behaviour and data quality, not the project's fundamentals, which you know nothing about.",
  "- Two or three sentences. Plain text only, no markdown, no headings, no bullet points.",
  "- Be neutral and specific. No hype words like moon, gem, explosive."
].join(NEWLINE);

function describeScore(value) {
  return value === null || value === undefined ? "unavailable" : String(value);
}

function buildUserPrompt(score, token) {
  const lines = [
    "Token: " + (token.symbol || "unknown symbol") + (token.name ? " (" + token.name + ")" : ""),
    "KeluScore: " + describeScore(score.kelu_score) + " out of 100, grade " + describeScore(score.grade),
    "",
    "Sub-scores (0-100):",
    "- Conviction: " + describeScore(score.conviction_score),
    "- Momentum: " + describeScore(score.momentum_score),
    "- Breadth: " + describeScore(score.breadth_score),
    "- Performance: " + describeScore(score.performance_score),
    "- Freshness: " + describeScore(score.freshness_score),
    "- Marketing: " + describeScore(score.marketing_score),
    "- Community: " + describeScore(score.community_score),
    "- Liquidity: " + describeScore(score.liquidity_score),
    "",
    "Call activity:",
    "- Calls in last 24h: " + describeScore(score.calls_24h),
    "- Calls in last 7d: " + describeScore(score.calls_7d),
    "- Calls in last 30d: " + describeScore(score.calls_30d),
    "- Distinct channels calling it: " + describeScore(score.unique_channels),
    "",
    "Signals the engine already derived (JSON):",
    JSON.stringify(score.signals || []),
    "",
    "Recommendations the engine already derived (JSON):",
    JSON.stringify(score.recommendations || []),
    "",
    "Write the note now."
  ];

  return lines.join(NEWLINE);
}

async function requestSummary(apiKey, userPrompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BASE_URL + "/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + apiKey
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      const error = new Error(
        "LLM request failed with status " + response.status + ": " + detail.slice(0, 300)
      );
      // Rate limits and provider outages are worth another attempt. A 400 or a
      // 401 is a bug or a bad key and retrying just burns time.
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }

    const payload = await response.json();
    const choice = payload && payload.choices && payload.choices[0];
    const content = choice && choice.message && choice.message.content;

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("LLM returned an empty completion");
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function needsSummary(score, existing) {
  if (!existing) return true;
  if (existing.prompt_version !== PROMPT_VERSION) return true;

  const previous = Number(existing.score_at_generation);
  const current = Number(score.kelu_score);

  if (Number.isFinite(previous) && Number.isFinite(current)) {
    if (Math.abs(current - previous) >= REGEN_SCORE_DELTA) return true;
  }

  const generatedAt = Date.parse(existing.generated_at);
  if (!Number.isFinite(generatedAt)) return true;

  const ageHours = (Date.now() - generatedAt) / (1000 * 60 * 60);
  return ageHours >= STALE_AFTER_HOURS;
}

async function runCycle(supabase, apiKey) {
  const { data: scores, error: scoresError } = await supabase
    .from("intent_scores")
    .select(SCORE_FIELDS)
    .order("kelu_score", { ascending: false })
    .limit(MAX_TOKENS_PER_CYCLE);

  if (scoresError) {
    throw new Error("Failed to read intent_scores: " + scoresError.message);
  }

  if (!scores || scores.length === 0) {
    return { candidates: 0, generated: 0, skipped: 0, failed: 0 };
  }

  const tokenIds = scores.map((score) => score.token_id);

  const tokensById = new Map();
  for (const batch of chunk(tokenIds, 200)) {
    const { data, error } = await supabase
      .from("tokens")
      .select("id, symbol, name")
      .in("id", batch);

    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to load tokens", { error: error.message });
      continue;
    }

    for (const token of data || []) tokensById.set(token.id, token);
  }

  const existingById = new Map();
  for (const batch of chunk(tokenIds, 200)) {
    const { data, error } = await supabase
      .from("intent_summaries")
      .select("token_id, score_at_generation, generated_at, prompt_version")
      .in("token_id", batch);

    if (error) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to load existing summaries", {
        error: error.message
      });
      continue;
    }

    for (const row of data || []) existingById.set(row.token_id, row);
  }

  const pending = scores.filter((score) =>
    needsSummary(score, existingById.get(score.token_id))
  );

  const skipped = scores.length - pending.length;

  if (pending.length === 0) {
    return { candidates: scores.length, generated: 0, skipped, failed: 0 };
  }

  log(LOG_LEVELS.INFO, WORKER_NAME, "Generating summaries", {
    pending: pending.length,
    skipped,
    model: MODEL
  });

  const results = await mapWithConcurrency(pending, CONCURRENCY, async (score) => {
    const token = tokensById.get(score.token_id);
    if (!token) return null;

    try {
      const summary = await withRetry(() => requestSummary(apiKey, buildUserPrompt(score, token)), {
        retries: 3,
        baseDelayMs: 2_000,
        shouldRetry: (error) => Boolean(error && error.retryable),
        onRetry: (error, attempt, delayMs) => {
          log(LOG_LEVELS.WARN, WORKER_NAME, "Retrying LLM request", {
            tokenId: score.token_id,
            attempt,
            delayMs,
            error: error.message
          });
        }
      });

      return {
        token_id: score.token_id,
        summary: summary.slice(0, 2000),
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        score_at_generation: score.kelu_score,
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to generate summary", {
        tokenId: score.token_id,
        error: error.message
      });
      return null;
    }
  });

  const rows = results.filter(Boolean);
  const failed = pending.length - rows.length;
  let generated = 0;

  for (const batch of chunk(rows, 50)) {
    const { error } = await supabase
      .from("intent_summaries")
      .upsert(batch, { onConflict: "token_id" });

    if (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to upsert summaries", {
        error: error.message,
        batchSize: batch.length
      });
      continue;
    }

    generated += batch.length;
  }

  return { candidates: scores.length, generated, skipped, failed };
}

async function main() {
  const apiKey = getEnv("OPENAI_API_KEY");

  if (!apiKey) {
    log(
      LOG_LEVELS.INFO,
      WORKER_NAME,
      "OPENAI_API_KEY is not set. Summary worker is inert and exiting cleanly."
    );
    return;
  }

  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  let running = false;

  async function runGuardedCycle() {
    if (running) {
      log(LOG_LEVELS.WARN, WORKER_NAME, "Previous cycle still running, skipping");
      return;
    }

    running = true;
    const runId = await startWorkerRun(supabase, WORKER_NAME, {
      model: MODEL,
      maxTokensPerCycle: MAX_TOKENS_PER_CYCLE
    });

    try {
      const summary = await runCycle(supabase, apiKey);
      log(LOG_LEVELS.INFO, WORKER_NAME, "Summary cycle complete", summary);
      await finishWorkerRun(supabase, WORKER_NAME, runId, "succeeded", summary);
    } catch (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Summary cycle failed", { error: error.message });
      await finishWorkerRun(supabase, WORKER_NAME, runId, "failed", { error: error.message });
    } finally {
      running = false;
    }
  }

  await runGuardedCycle();

  if (process.env.WORKER_RUN_ONCE === "true") {
    log(LOG_LEVELS.INFO, WORKER_NAME, "Run-once mode complete");
    return;
  }

  // No unref() on purpose: it would let the process exit with the timer
  // pending, so daemon mode would run one cycle and quit.
  setInterval(runGuardedCycle, POLL_INTERVAL_MS);
}

main().catch((error) => {
  log(LOG_LEVELS.ERROR, WORKER_NAME, "Fatal worker crash", { error: error.message });
  process.exit(1);
});
