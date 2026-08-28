import type { NewsSource, ResearchItem } from "../types";

export interface NewsProvider {
  source: NewsSource;
  fetchItems(): Promise<ResearchItem[]>;
}

export type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stableId(source: NewsSource, url: string, title: string): string {
  const input = `${source}:${url || title}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source}_${(hash >>> 0).toString(36)}`;
}

export async function fetchJson(
  url: URL,
  source: NewsSource,
  timeoutMs: number,
  headers: Record<string, string> = {}
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "kelucalls-research/1.0",
        ...headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`request failed with status ${response.status}`);
    }

    const text = await response.text();
    if (text.trim() === "") {
      throw new Error("empty response body");
    }

    try {
      return JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(
        `response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message
        : String(error);
    throw new Error(reason);
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchText(
  url: URL,
  source: NewsSource,
  timeoutMs: number,
  userAgent: string = "kelucalls-research/1.0"
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        accept: "application/rss+xml, application/xml, text/xml, text/plain",
        "user-agent": userAgent
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`request failed with status ${response.status}`);
    }

    const text = await response.text();
    if (text.trim() === "") throw new Error("empty response body");
    return text;
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.name === "AbortError"
          ? "timeout"
          : error.message
        : String(error);
    throw new Error(reason);
  } finally {
    clearTimeout(timeout);
  }
}
