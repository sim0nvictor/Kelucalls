import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_TELEGRAM_ENV = ["TELEGRAM_API_ID", "TELEGRAM_API_HASH"];
const SUPABASE_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

let loadedEnv = null;

function findProjectRoot(startDir) {
  let currentDir = startDir;

  while (true) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

function readEnv(name) {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function maskValue(value) {
  if (!value) {
    return "missing";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function getCallerDir(importMetaUrl) {
  return importMetaUrl ? path.dirname(fileURLToPath(importMetaUrl)) : process.cwd();
}

export function loadScraperEnv(importMetaUrl = null) {
  if (loadedEnv) {
    return loadedEnv;
  }

  const projectRoot = findProjectRoot(getCallerDir(importMetaUrl));
  const envPath = path.resolve(projectRoot, ".env");
  const result = dotenv.config({ path: envPath, quiet: true });

  loadedEnv = {
    cwd: process.cwd(),
    envPath,
    envExists: fs.existsSync(envPath),
    loaded: !result.error,
    error: result.error?.message ?? null,
  };

  return loadedEnv;
}

function logEnvStatus(name) {
  const value = readEnv(name);
  console.log(`[scraper-env] ${name}: ${value ? `set (${maskValue(value)})` : "missing"}`);
}

export function logScraperEnvStatus(envState = loadedEnv) {
  const state = envState ?? loadScraperEnv();

  console.log(`[scraper-env] cwd: ${state.cwd}`);
  console.log(`[scraper-env] resolved .env path: ${state.envPath}`);
  console.log(`[scraper-env] .env exists: ${state.envExists ? "yes" : "no"}`);
  console.log(`[scraper-env] .env loaded: ${state.loaded ? "yes" : "no"}`);

  if (state.error) {
    console.log(`[scraper-env] .env load error: ${state.error}`);
  }

  for (const name of [...REQUIRED_TELEGRAM_ENV, ...SUPABASE_ENV]) {
    logEnvStatus(name);
  }

  logEnvStatus("TELEGRAM_SCRAPER_SESSION");
  if (!readEnv("TELEGRAM_SCRAPER_SESSION") && readEnv("TELEGRAM_SESSION")) {
    console.log("[scraper-env] TELEGRAM_SESSION: present but ignored; generate a fresh TELEGRAM_SCRAPER_SESSION");
  }
}

export function getRequiredEnv(name) {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function validateScraperEnv({ requireSupabase = false, requireSession = true, allowLegacySession = false } = {}) {
  const required = requireSupabase
    ? [...REQUIRED_TELEGRAM_ENV, "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    : REQUIRED_TELEGRAM_ENV;

  const missing = required.filter((name) => !readEnv(name));
  if (requireSession && !readEnv("TELEGRAM_SCRAPER_SESSION") && (!allowLegacySession || !readEnv("TELEGRAM_SESSION"))) {
    missing.push(allowLegacySession ? "TELEGRAM_SCRAPER_SESSION (or TELEGRAM_SESSION)" : "TELEGRAM_SCRAPER_SESSION");
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Check that .env exists at ${loadedEnv?.envPath ?? ".env"}.`
    );
  }

  const apiId = Number(readEnv("TELEGRAM_API_ID"));
  if (!Number.isInteger(apiId) || apiId <= 0) {
    throw new Error("TELEGRAM_API_ID must be a positive integer.");
  }

  return {
    telegram: {
      apiId,
      apiHash: getRequiredEnv("TELEGRAM_API_HASH"),
      session: requireSession ? readEnv("TELEGRAM_SCRAPER_SESSION") ?? getRequiredEnv("TELEGRAM_SESSION") : "",
    },
    supabase: {
      url: readEnv("SUPABASE_URL"),
      serviceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
      nextPublicUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
      anonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    },
  };
}

export function reportSupabaseEnvFormatting() {
  const urlNames = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];

  for (const name of urlNames) {
    const value = readEnv(name);
    if (!value) {
      console.log(`[scraper-env] ${name}: missing`);
      continue;
    }

    try {
      const parsed = new URL(value);
      const validProtocol = parsed.protocol === "https:" || parsed.protocol === "http:";
      console.log(`[scraper-env] ${name}: ${validProtocol ? "valid URL" : `unexpected protocol ${parsed.protocol}`}`);
    } catch {
      console.log(`[scraper-env] ${name}: malformed URL`);
    }
  }

  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const value = readEnv(name);
    console.log(`[scraper-env] ${name}: ${value ? `set (${maskValue(value)})` : "missing"}`);
  }
}
