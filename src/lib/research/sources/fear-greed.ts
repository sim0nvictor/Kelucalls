/**
 * Alternative.me Fear & Greed Index provider.
 *
 * Server-only. The Fear & Greed API is public — no API key required. This
 * module is the ONLY place in the project that should touch that API.
 *
 * Public surface
 * --------------
 *   getFearGreedSnapshot(): Promise<FearGreedSnapshot | null>
 *
 * The function is intentionally non-throwing: on any failure (timeout, network
 * error, non-2xx, malformed JSON, schema mismatch) it returns null and logs a
 * warning. The caller (future Daily Research Engine worker) decides how to
 * handle "no data this cycle."
 *
 * Response shape (api.alternative.me/fng/?limit=N&format=json):
 *   {
 *     "name": "Fear and Greed Index",
 *     "data": [
 *       { "value": "71", "value_classification": "Greed", "timestamp": "1787788800", "time_until_update": "48772" },
 *       ...  (ordered newest -> oldest)
 *     ]
 *   }
 *
 * We request limit=30 so the snapshot carries enough history to compute
 * previous-day, 7-day, and 30-day context.
 *
 * Why no cache here
 * -----------------
 * Caching belongs to the caller (the worker), not the provider. A snapshot
 * is requested at most once per cycle and the worker persists whatever it
 * gets. Keeping the provider stateless makes it trivially replaceable.
 */

import type {
  FearGreedReading,
  FearGreedSnapshot
} from "@/lib/research/types";

const FEAR_GREED_BASE_URL = "https://api.alternative.me/fng";

/** How many days of history we fetch. 30 covers the 30-day context window. */
const HISTORY_LIMIT = 30;

const REQUEST_TIMEOUT_MS = 8_000;
const USER_AGENT = "kelucalls-research/1.0";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Fetch a JSON document from Alternative.me with an explicit timeout.
 *
 * Never throws. On any failure (timeout, network error, non-2xx, non-JSON,
 * empty body) it logs a warning and returns null.
 */
async function fetchJson(pathname: string, query: Record<string, string>): Promise<unknown> {
  const url = new URL(FEAR_GREED_BASE_URL + pathname);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT
      },
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn("[fear-greed] request failed", {
        pathname,
        status: response.status
      });
      return null;
    }

    const text = await response.text();
    if (text.trim() === "") {
      console.warn("[fear-greed] empty response body", { pathname });
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.warn("[fear-greed] response was not valid JSON", {
        pathname,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }

    if (parsed === null || typeof parsed !== "object") {
      console.warn("[fear-greed] response was not a JSON object or array", {
        pathname
      });
      return null;
    }

    return parsed;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message
        : String(error);

    console.warn("[fear-greed] request error", { pathname, reason });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse one Alternative.me data row into a FearGreedReading.
 * Returns null when the row cannot be normalized to a usable reading.
 */
function parseReading(row: unknown): FearGreedReading | null {
  const record = readRecord(row);
  if (!record) return null;

  // The API publishes `value` as a string like "71" — coerce to a number and
  // clamp to the documented 0-100 range so a malformed payload can't poison
  // downstream math.
  const rawValue = readNumber(record.value);
  const value =
    rawValue === null
      ? null
      : Math.max(0, Math.min(100, Math.round(rawValue)));

  const classification = readString(record.value_classification);
  const unixSeconds = readNumber(record.timestamp);
  const timestamp =
    unixSeconds === null ? null : new Date(unixSeconds * 1000).toISOString();

  // If we couldn't extract a value AND a timestamp, the row is unusable.
  if (value === null && timestamp === null) {
    return null;
  }

  return { value, classification, timestamp };
}

/**
 * Build a FearGreedSnapshot from the API payload. Returns null when the
 * payload is fundamentally malformed (no `data` array).
 */
function parseSnapshot(payload: unknown): FearGreedSnapshot | null {
  const root = readRecord(payload);
  if (!root) return null;

  const rows = readArray(root.data);
  // Alternative.me returns entries newest -> oldest. We build a normalized
  // array (dropping unusable rows) in the same order; the context windows
  // are reversed to oldest -> newest so consumers can iterate chronologically.
  const readings: FearGreedReading[] = [];
  for (const row of rows) {
    const parsed = parseReading(row);
    if (parsed) readings.push(parsed);
  }

  const current = readings[0] ?? null;
  const previousDay = readings[1] ?? null;

  // Skip "today" (index 0) — the context windows are the days BEFORE today.
  // Up to 6 prior days for the 7-day context (yesterday + 5 earlier).
  // Up to 29 prior days for the 30-day context.
  const priorReadings = readings.slice(1);
  const context7d = priorReadings.slice(0, 6).slice().reverse();
  const context30d = priorReadings.slice(0, 29).slice().reverse();

  return {
    current,
    previousDay,
    context7d,
    context30d,
    fetchedAt: new Date().toISOString(),
    source: "fear_greed"
  };
}

/**
 * Produce a normalized Fear & Greed snapshot from Alternative.me.
 *
 * - Returns null when the request fails entirely (timeout, non-2xx, etc.).
 * - Returns a snapshot with the `current` field null when the response was
 *   well-formed but empty.
 * - Never throws; the Daily Research Engine worker treats null as "skip".
 */
export async function getFearGreedSnapshot(): Promise<FearGreedSnapshot | null> {
  const payload = await fetchJson("/", {
    limit: String(HISTORY_LIMIT),
    format: "json"
  });

  if (!payload) return null;
  return parseSnapshot(payload);
}
