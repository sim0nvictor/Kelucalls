import type {
  DailyResearchReport,
  DailyResearchSection,
  DailyResearchSectionKey,
  DailyResearchSnapshot,
  DailyResearchSource,
  ResearchSignalsBlock
} from "./types";
import { DAILY_RESEARCH_SECTION_KEYS } from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30_000;

const FINANCIAL_DISCLAIMER =
  "This is informational research, not financial advice. It is not a recommendation to buy, sell, or hold any asset. Verify the underlying data and make independent decisions.";

const SYSTEM_PROMPT = [
  "You are the Daily Research Generator for Kelucalls.",
  "Return JSON only. Do not use markdown, HTML, or code fences.",
  "The user message contains the complete and only evidence available to you: a structured research snapshot and deterministic signal results.",
  "Use only values, events, dates, quotes, sources, opinions, and statistics present in that JSON.",
  "Never invent or infer a price, percentage, date, event, quote, source, KOL opinion, or token statistic.",
  "Do not turn missing or null data into a claim. Say that the evidence is unavailable when needed.",
  "Do not write investment recommendations, predictions, calls to action, or buy/sell/hold language.",
  "Every section must contain concise analytical prose and evidence references as JSON paths into the supplied payload.",
  "Use evidence references only for fields that actually support the section. Do not cite a source merely because it exists.",
  "For KOL and narrative intelligence, report only what supplied news items explicitly state; absence of KOL data means unavailable.",
  `The required section keys are: ${DAILY_RESEARCH_SECTION_KEYS.join(", ")}.`,
  'Return exactly {"sections":{"<section_key>":{"content":"...","evidence":["..."]}}}.',
  "Keep the tone analytical, neutral, professional, concise, and evidence-driven."
].join("\n");

type GeneratorPayload = {
  research_snapshot: DailyResearchSnapshot;
  signal_results: ResearchSignalsBlock | null;
};

export type DailyResearchGeneratorOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  generatedAt?: string;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function buildSources(snapshot: DailyResearchSnapshot): DailyResearchSource[] {
  const sources: DailyResearchSource[] = [];
  for (const source of Object.keys(snapshot.providerStatus)) {
    sources.push({
      source,
      title: `${source} structured research snapshot`,
      url: null,
      publishedAt: null
    });
  }

  for (const item of snapshot.newsData?.items ?? []) {
    sources.push({
      source: item.source,
      title: item.title,
      url: item.url,
      publishedAt: item.published_at
    });
  }

  return sources;
}

function allowedEvidenceReferences(snapshot: DailyResearchSnapshot): Set<string> {
  const references = new Set([
    "research_snapshot.marketData",
    "research_snapshot.sentimentData",
    "research_snapshot.defiData",
    "research_snapshot.kelucallsData",
    "research_snapshot.newsData",
    "signal_results"
  ]);

  for (const item of snapshot.newsData?.items ?? []) {
    references.add(`research_snapshot.newsData.items.${item.id}`);
  }
  for (const signal of snapshot.signals?.signals ?? []) {
    references.add(`signal_results.signals.${signal.signal_type}`);
  }
  return references;
}

function parseSections(value: unknown, allowedEvidence: Set<string>): Record<DailyResearchSectionKey, DailyResearchSection> {
  const root = readRecord(value);
  const sectionsValue = root?.sections;
  const sections = readRecord(sectionsValue);
  if (!sections) throw new Error("LLM response is missing sections");

  const result = {} as Record<DailyResearchSectionKey, DailyResearchSection>;
  for (const key of DAILY_RESEARCH_SECTION_KEYS) {
    const section = readRecord(sections[key]);
    const content = section?.content;
    const evidence = section?.evidence;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error(`LLM response has invalid section content: ${key}`);
    }
    if (!Array.isArray(evidence) || evidence.some((item) => typeof item !== "string")) {
      throw new Error(`LLM response has invalid section evidence: ${key}`);
    }
    for (const reference of evidence) {
      if (!allowedEvidence.has(reference)) {
        throw new Error(`LLM response cited unsupplied evidence: ${reference}`);
      }
    }
    result[key] = { content: content.trim(), evidence: [...evidence] };
  }

  const returnedKeys = Object.keys(sections).sort();
  const expectedKeys = [...DAILY_RESEARCH_SECTION_KEYS].sort();
  if (JSON.stringify(returnedKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("LLM response contains unexpected section keys");
  }
  return result;
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("LLM response was not valid JSON");
  }
}

export function buildDailyResearchGeneratorPayload(
  snapshot: DailyResearchSnapshot,
  signals: ResearchSignalsBlock | null = snapshot.signals
): GeneratorPayload {
  return { research_snapshot: snapshot, signal_results: signals };
}

type LLMErrorCategory = "rate_limit" | "quota" | "auth" | "server" | "unknown";

interface LLMErrorDiagnosis {
  category: LLMErrorCategory;
  status: number;
  reason: string;
  retryable: boolean;
}

/**
 * Safely diagnose an LLM error response without exposing sensitive data.
 * Inspects the status code and response body to determine the real cause.
 */
async function diagnoseLLMError(status: number, responseText: string): Promise<LLMErrorDiagnosis> {
  let body: unknown = null;
  try {
    body = JSON.parse(responseText);
  } catch {
    // If response is not JSON, classify by status code only
  }

  const bodyRecord = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  const errorObj = bodyRecord?.error;
  const errorMessage = typeof errorObj === "object" && errorObj !== null 
    ? (errorObj as Record<string, unknown>)?.message 
    : null;

  // OpenAI 429: could be rate limiting (retryable) or quota (not retryable)
  if (status === 429) {
    const message = typeof errorMessage === "string" ? errorMessage.toLowerCase() : "";
    const quota = message.includes("quota") || message.includes("insufficient");
    const retryable = !quota;
    const reason = quota 
      ? "quota exhausted or insufficient credits" 
      : "rate limited (transient)";
    return { category: quota ? "quota" : "rate_limit", status, reason, retryable };
  }

  // 401/403: auth issues, never retry
  if (status === 401 || status === 403) {
    return { category: "auth", status, reason: "authentication failed", retryable: false };
  }

  // 5xx: server errors, retryable
  if (status >= 500) {
    return { category: "server", status, reason: `server error (${status})`, retryable: true };
  }

  // Everything else: unknown
  return { category: "unknown", status, reason: `HTTP ${status}`, retryable: false };
}

async function generateDailyResearchReportWithRetry(
  snapshot: DailyResearchSnapshot,
  apiKey: string,
  baseUrl: string,
  model: string,
  timeoutMs: number,
  generatedAt: string,
  fetchImpl: typeof fetch
): Promise<DailyResearchReport> {
  const MAX_RETRIES = 3;
  let lastDiagnosis: LLMErrorDiagnosis | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const payload = buildDailyResearchGeneratorPayload(snapshot);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: JSON.stringify(payload) }
            ]
          })
        });

        if (response.ok) {
          const responsePayload = (await response.json()) as Record<string, unknown>;
          const choices = Array.isArray(responsePayload.choices) ? responsePayload.choices : [];
          const firstChoice = readRecord(choices[0]);
          const message = readRecord(firstChoice?.message);
          const content = message?.content;
          if (typeof content !== "string") throw new Error("Daily research LLM returned no content");

          return {
            schemaVersion: 1,
            snapshotDate: snapshot.snapshotDate,
            collectedAt: snapshot.collectedAt,
            generatedAt,
            sections: parseSections(parseJsonContent(content), allowedEvidenceReferences(snapshot)),
            sources: buildSources(snapshot),
            financialDisclaimer: FINANCIAL_DISCLAIMER
          };
        }

        // Response not ok, diagnose the error
        const responseText = await response.text();
        lastDiagnosis = await diagnoseLLMError(response.status, responseText);

        // If not retryable, fail immediately
        if (!lastDiagnosis.retryable) {
          throw new Error(
            `Daily research LLM request failed (${lastDiagnosis.category}): ${lastDiagnosis.reason}`
          );
        }

        // Retryable error, log and continue to retry
        console.warn("[daily-research] LLM request transient error", {
          attempt,
          maxRetries: MAX_RETRIES,
          category: lastDiagnosis.category,
          status: lastDiagnosis.status
        });

        if (attempt < MAX_RETRIES) {
          // Exponential backoff: 1s, 2s, 4s (capped at 30s)
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      // If this was the last attempt and we have a diagnosis, include it
      if (attempt === MAX_RETRIES && lastDiagnosis) {
        throw new Error(
          `Daily research LLM request failed after ${MAX_RETRIES} attempts (${lastDiagnosis.category}): ${lastDiagnosis.reason}`
        );
      }
      throw error;
    }
  }

  // Should not reach here
  throw new Error("Daily research LLM generation failed");
}

export async function generateDailyResearchReport(
  snapshot: DailyResearchSnapshot,
  options: DailyResearchGeneratorOptions = {}
): Promise<DailyResearchReport> {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") throw new Error("Missing OPENAI_API_KEY");

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = options.model ?? process.env.DAILY_RESEARCH_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? Number(process.env.DAILY_RESEARCH_TIMEOUT_MS ?? REQUEST_TIMEOUT_MS);
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  return generateDailyResearchReportWithRetry(snapshot, apiKey, baseUrl, model, timeoutMs, generatedAt, fetchImpl);
}