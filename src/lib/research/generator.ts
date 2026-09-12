import type {
  DailyResearchReport,
  DailyResearchSection,
  DailyResearchSectionKey,
  DailyResearchSnapshot,
  DailyResearchSource,
  ResearchSignalsBlock
} from "./types";
import { DAILY_RESEARCH_SECTION_KEYS } from "./types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
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

function normalizeEvidenceReference(reference: string): string {
  const normalized = reference
    .trim()
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/\.+/g, ".")
    .replace(/^\./, "")
    .replace(/\.$/, "");

  if (normalized === "signals") return "signal_results";
  if (normalized === "signal_results" || normalized === "research_snapshot") return normalized;
  if (normalized.startsWith("research_snapshot.")) return normalized;
  if (normalized.startsWith("signal_results.")) return normalized;

  if (normalized.startsWith("signals.")) {
    return `signal_results.${normalized.slice("signals.".length)}`;
  }

  if (normalized.startsWith("research_snapshot.signals.")) {
    return `signal_results.${normalized.slice("research_snapshot.signals.".length)}`;
  }

  const relativeRoots = [
    "marketData",
    "sentimentData",
    "defiData",
    "kelucallsData",
    "newsData"
  ];

  if (relativeRoots.some((root) => normalized === root || normalized.startsWith(`${root}.`))) {
    return `research_snapshot.${normalized}`;
  }

  return normalized;
}

function collectEvidencePaths(prefix: string, value: unknown, references: Set<string>): void {
  if (value === null || value === undefined) {
    references.add(normalizeEvidenceReference(prefix));
    return;
  }

  if (Array.isArray(value)) {
    references.add(normalizeEvidenceReference(prefix));
    value.forEach((item, index) => collectEvidencePaths(`${prefix}[${index}]`, item, references));
    return;
  }

  if (typeof value !== "object") {
    references.add(normalizeEvidenceReference(prefix));
    return;
  }

  const record = value as Record<string, unknown>;
  references.add(normalizeEvidenceReference(prefix));
  for (const [key, child] of Object.entries(record)) {
    collectEvidencePaths(`${prefix}.${key}`, child, references);
  }
}

function allowedEvidenceReferences(snapshot: DailyResearchSnapshot): Set<string> {
  const references = new Set<string>(["signal_results"]);

  collectEvidencePaths("research_snapshot.marketData", snapshot.marketData, references);
  collectEvidencePaths("research_snapshot.sentimentData", snapshot.sentimentData, references);
  collectEvidencePaths("research_snapshot.defiData", snapshot.defiData, references);
  collectEvidencePaths("research_snapshot.kelucallsData", snapshot.kelucallsData, references);
  collectEvidencePaths("research_snapshot.newsData", snapshot.newsData, references);
  collectEvidencePaths("signal_results", snapshot.signals, references);

  for (const item of snapshot.newsData?.items ?? []) {
    references.add(`research_snapshot.newsData.items.${item.id}`);
  }
  for (const signal of snapshot.signals?.signals ?? []) {
    references.add(`signal_results.signals.${signal.signal_type}`);
    references.add(`signal_results.signals.${snapshot.signals?.signals.indexOf(signal) ?? 0}`);
  }
  for (const index of (snapshot.signals?.signals ?? []).keys()) {
    references.add(`signals.signals.${index}`);
    references.add(`signal_results.signals.${index}`);
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
      const normalizedReference = normalizeEvidenceReference(reference);
      if (!allowedEvidence.has(normalizedReference)) {
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

function normalizeJsonText(content: string): string {
  const trimmed = content.trim();

  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  const leadingJsonStart = trimmed.indexOf("{");
  const trailingJsonEnd = trimmed.lastIndexOf("}");
  if (leadingJsonStart !== -1 && trailingJsonEnd !== -1 && trailingJsonEnd > leadingJsonStart) {
    return trimmed.slice(leadingJsonStart, trailingJsonEnd + 1).trim();
  }

  return trimmed;
}

function parseJsonContent(content: string): unknown {
  const normalized = normalizeJsonText(content);

  try {
    return JSON.parse(normalized);
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

export class DailyResearchLLMError extends Error {
  category: LLMErrorCategory;
  status: number;
  retryable: boolean;
  retryAfterSeconds: number | null;

  constructor(args: {
    message: string;
    category: LLMErrorCategory;
    status: number;
    retryable: boolean;
    retryAfterSeconds?: number | null;
  }) {
    super(args.message);
    this.name = "DailyResearchLLMError";
    this.category = args.category;
    this.status = args.status;
    this.retryable = args.retryable;
    this.retryAfterSeconds = args.retryAfterSeconds ?? null;
  }
}

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

  // Gemini 429: could be rate limiting (retryable) or quota (not retryable)
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
        const endpoint = `${baseUrl}/${encodeURIComponent(model)}:generateContent`;
        const response = await fetchImpl(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: SYSTEM_PROMPT }]
            },
            contents: [{
              role: "user",
              parts: [{ text: JSON.stringify(payload) }]
            }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json"
            }
          })
        });

        if (response.ok) {
          const responsePayload = (await response.json()) as Record<string, unknown>;
          const candidates = Array.isArray(responsePayload.candidates) ? responsePayload.candidates : [];
          const firstCandidate = readRecord(candidates[0]);
          const candidateContent = readRecord(firstCandidate?.content);
          const contentParts = Array.isArray(candidateContent?.parts) ? (candidateContent.parts as unknown[]) : [];
          const contentText = contentParts
            .map((part: unknown) => typeof part === "object" && part !== null && "text" in part ? String((part as Record<string, unknown>).text ?? "") : "")
            .join("")
            .trim();

          if (contentText === "") throw new Error("Daily research LLM returned no content");

          return {
            schemaVersion: 1,
            snapshotDate: snapshot.snapshotDate,
            collectedAt: snapshot.collectedAt,
            generatedAt,
            sections: parseSections(parseJsonContent(contentText), allowedEvidenceReferences(snapshot)),
            sources: buildSources(snapshot),
            financialDisclaimer: FINANCIAL_DISCLAIMER
          };
        }

        const responseText = await response.text();
        lastDiagnosis = await diagnoseLLMError(response.status, responseText);

        if (!lastDiagnosis.retryable) {
          throw new DailyResearchLLMError({
            message: `Daily research LLM request failed (${lastDiagnosis.category}): ${lastDiagnosis.reason}`,
            category: lastDiagnosis.category,
            status: lastDiagnosis.status,
            retryable: false
          });
        }

        console.warn("[daily-research] LLM request transient error", {
          attempt,
          maxRetries: MAX_RETRIES,
          category: lastDiagnosis.category,
          status: lastDiagnosis.status
        });

        if (attempt < MAX_RETRIES) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterSeconds = retryAfterHeader ? Number.parseFloat(retryAfterHeader) : Number.NaN;
          const fallbackDelayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          const retryAfterDelayMs = Number.isFinite(retryAfterSeconds)
            ? Math.max(0, retryAfterSeconds * 1000)
            : fallbackDelayMs;
          const delayMs = Math.max(retryAfterDelayMs, fallbackDelayMs);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof DailyResearchLLMError) {
        if (attempt === MAX_RETRIES) throw error;
        continue;
      }

      if (attempt === MAX_RETRIES && lastDiagnosis) {
        throw new DailyResearchLLMError({
          message: `Daily research LLM request failed after ${MAX_RETRIES} attempts (${lastDiagnosis.category}): ${lastDiagnosis.reason}`,
          category: lastDiagnosis.category,
          status: lastDiagnosis.status,
          retryable: lastDiagnosis.retryable
        });
      }

      throw error;
    }
  }

  if (lastDiagnosis) {
    throw new DailyResearchLLMError({
      message: `Daily research LLM request failed after ${MAX_RETRIES} attempts (${lastDiagnosis.category}): ${lastDiagnosis.reason}`,
      category: lastDiagnosis.category,
      status: lastDiagnosis.status,
      retryable: lastDiagnosis.retryable
    });
  }

  throw new Error("Daily research LLM generation failed");
}

export async function generateDailyResearchReport(
  snapshot: DailyResearchSnapshot,
  options: DailyResearchGeneratorOptions = {}
): Promise<DailyResearchReport> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") throw new Error("Missing GEMINI_API_KEY");

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? process.env.GEMINI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = options.model ?? process.env.DAILY_RESEARCH_MODEL ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? Number(process.env.DAILY_RESEARCH_TIMEOUT_MS ?? REQUEST_TIMEOUT_MS);
  const generatedAt = options.generatedAt ?? new Date().toISOString();

  return generateDailyResearchReportWithRetry(snapshot, apiKey, baseUrl, model, timeoutMs, generatedAt, fetchImpl);
}
