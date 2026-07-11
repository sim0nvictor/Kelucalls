import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOG_LEVELS = { ERROR: "ERROR", WARN: "WARN", INFO: "INFO", DEBUG: "DEBUG" };

export function log(level, worker, message, meta = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    worker,
    message,
    ...meta
  }));
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}

export async function withRetry(operation, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 1_000,
    maxDelayMs = 15_000,
    shouldRetry = () => true,
    onRetry = () => {}
  } = options;

  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) break;

      const jitterMs = Math.floor(Math.random() * 250);
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) + jitterMs;
      onRetry(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function findProjectRoot(startDir) {
  let currentDir = startDir;
  while (true) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) return currentDir;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return startDir;
    currentDir = parentDir;
  }
}

export function loadWorkerEnv(importMetaUrl) {
  const workerDir = path.dirname(fileURLToPath(importMetaUrl));
  const projectRoot = findProjectRoot(workerDir);
  const envPath = path.join(projectRoot, ".env");
  const localEnvPath = path.join(projectRoot, ".env.local");

  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, quiet: true });
  if (fs.existsSync(localEnvPath)) dotenv.config({ path: localEnvPath, override: false, quiet: true });

  return {
    projectRoot,
    envPath,
    envExists: fs.existsSync(envPath),
    localEnvPath,
    localEnvExists: fs.existsSync(localEnvPath)
  };
}

export function getEnv(name, fallback = null) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

export function getNumberEnv(name, fallback) {
  const value = toFiniteNumber(getEnv(name), null);
  return value === null ? fallback : value;
}

export function getSupabaseConfig() {
  const url = getEnv("SUPABASE_URL") || getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_KEY");

  if (!url) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY");

  return { url, key };
}

export function isTransientHttpError(error) {
  const status = error?.response?.status;
  if (!status) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export async function startWorkerRun(supabase, workerName, details = {}) {
  const { data, error } = await supabase
    .from("worker_runs")
    .insert({
      worker_name: workerName,
      status: "running",
      started_at: new Date().toISOString(),
      details
    })
    .select("id")
    .single();

  if (error) {
    log(LOG_LEVELS.WARN, workerName, "Failed to create worker health row", { error: error.message });
    return null;
  }

  return data?.id ?? null;
}

export async function finishWorkerRun(supabase, workerName, runId, status, details = {}) {
  if (!runId) return;

  const { error } = await supabase
    .from("worker_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      details
    })
    .eq("id", runId);

  if (error) {
    log(LOG_LEVELS.WARN, workerName, "Failed to update worker health row", {
      runId,
      status,
      error: error.message
    });
  }
}
