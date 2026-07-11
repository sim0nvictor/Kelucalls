/**
 * Token Logo Backfill
 *
 * One-time (safely re-runnable) pass over tokens missing a logo_url, fetching
 * the image from DexScreener and saving it. Needed because the gap predates
 * the price-update and scraper logo fixes — those only cover *new* tokens and
 * tokens that still have an open call. Existing tokens need this to be
 * repainted at all.
 *
 * Run manually:
 *   node workers/token-logo-backfill.js
 *
 * Default mode only touches tokens where logo_url IS NULL — safe to re-run
 * as many times as you like, it just shrinks the remaining set each time.
 *
 *   node workers/token-logo-backfill.js --force
 *
 * --force re-checks every token with a contract_address, even ones that
 * already have a logo_url, in case DexScreener's image changed.
 */

import axios from "axios";
import { createClient } from "@supabase/supabase-js";
import {
  LOG_LEVELS,
  getSupabaseConfig,
  loadWorkerEnv,
  log,
  sleep
} from "./worker-utils.js";

const WORKER_NAME = "token-logo-backfill";
const DEX_API_TIMEOUT_MS = 10_000;
const REQUEST_DELAY_MS = 250;   // ~240 req/min — stays under DexScreener's 300/min cap
const FETCH_LIMIT = 2000;       // bump this (or just re-run) if you ever have more tokens than this missing a logo

loadWorkerEnv(import.meta.url);

const FORCE_REFRESH = process.argv.includes("--force");

async function fetchLogoUrl(contractAddress) {
  try {
    const { data } = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(contractAddress)}`,
      { timeout: DEX_API_TIMEOUT_MS }
    );
    const pair = data?.pairs?.[0];
    // DexScreener omits `info` on thin-liquidity / brand-new pairs — guard for it.
    return pair?.info?.imageUrl ?? null;
  } catch (err) {
    log(LOG_LEVELS.WARN, WORKER_NAME, "DexScreener fetch failed", {
      contract: contractAddress,
      error: err.message
    });
    return null;
  }
}

async function getTargetTokens(supabase) {
  let query = supabase
    .from("tokens")
    .select("id, symbol, chain, contract_address, logo_url")
    .not("contract_address", "is", null)
    .order("created_at", { ascending: true })
    .limit(FETCH_LIMIT);

  if (!FORCE_REFRESH) {
    query = query.is("logo_url", null);
  }

  const { data, error } = await query;
  if (error) {
    log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to load tokens", { error: error.message });
    return [];
  }
  return data ?? [];
}

async function main() {
  const { url, key } = getSupabaseConfig();
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  log(LOG_LEVELS.INFO, WORKER_NAME, "Starting backfill", { forceRefresh: FORCE_REFRESH });

  const tokens = await getTargetTokens(supabase);
  log(LOG_LEVELS.INFO, WORKER_NAME, "Tokens to process", { count: tokens.length });

  // Tokens with no contract_address at all (well-known symbols like XRP, or
  // anything inserted via the WELL_KNOWN_SYMBOLS fallback in the scraper)
  // can't be looked up by DexScreener's token-address endpoint. They're
  // simply skipped here — flagged in the summary below so you can see how
  // many are left on initials and decide whether they need a manual/static
  // logo mapping.
  const { count: noContractCount } = await supabase
    .from("tokens")
    .select("id", { count: "exact", head: true })
    .is("contract_address", null)
    .is("logo_url", null);

  let updated = 0;
  let notFound = 0;
  let unchanged = 0;
  let failed = 0;

  for (const token of tokens) {
    const logoUrl = await fetchLogoUrl(token.contract_address);

    if (!logoUrl) {
      log(LOG_LEVELS.DEBUG, WORKER_NAME, "No logo available on DexScreener", {
        symbol: token.symbol,
        chain: token.chain
      });
      notFound++;
    } else if (logoUrl === token.logo_url) {
      unchanged++;
    } else {
      const { error } = await supabase
        .from("tokens")
        .update({ logo_url: logoUrl })
        .eq("id", token.id);

      if (error) {
        log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to save logo_url", {
          symbol: token.symbol,
          error: error.message
        });
        failed++;
      } else {
        log(LOG_LEVELS.INFO, WORKER_NAME, "Logo saved", { symbol: token.symbol, chain: token.chain });
        updated++;
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  log(LOG_LEVELS.INFO, WORKER_NAME, "Backfill complete", {
    processed: tokens.length,
    updated,
    notFoundOnDexScreener: notFound,
    unchanged,
    failed,
    skippedNoContractAddress: noContractCount ?? 0
  });

  // Pick up the new logos in trending_tokens immediately rather than waiting
  // for the next scheduled trending-aggregate cycle.
  const { error: refreshError } = await supabase.rpc("refresh_public_analytics");
  if (refreshError) {
    log(LOG_LEVELS.WARN, WORKER_NAME, "trending_tokens refresh failed — run manually in SQL editor", {
      error: refreshError.message
    });
  } else {
    log(LOG_LEVELS.INFO, WORKER_NAME, "trending_tokens refreshed");
  }
}

main().catch((err) => {
  log(LOG_LEVELS.ERROR, WORKER_NAME, "Fatal error", { error: err.message });
  process.exit(1);
});