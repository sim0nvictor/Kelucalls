/**
 * Token Logo Backfill
 *
 * Safely re-runnable pass over tokens that don't yet have a STABLE logo. For
 * each one it looks up the image on DexScreener, DOWNLOADS it, uploads it to the
 * public Supabase Storage `assets` bucket, and saves the stable Storage URL to
 * tokens.logo_url.
 *
 * A logo is "stable" when it already points at our Storage bucket. The default
 * target set is therefore: tokens with a contract_address whose logo_url is
 * NULL or is a non-stable external URL (e.g. a DexScreener CDN URL that predates
 * stable asset storage). Once a token has a stable Storage logo it is skipped,
 * so this is safe to re-run — the remaining set just shrinks each time.
 *
 * Identity is chain + contract_address (never the symbol), which also gives the
 * deterministic storage path tokens/{chain}/{contract_address}.{ext}.
 *
 * Run manually:
 *   node workers/token-logo-backfill.js
 *
 *   node workers/token-logo-backfill.js --force
 *
 * --force re-checks every token with a contract_address (including ones that
 * already have a stable Storage logo), in case DexScreener's image changed.
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
import {
  isStableAssetUrl,
  normalizeContractForPath,
  resolveAndStoreImage
} from "./asset-store.js";

const WORKER_NAME = "token-logo-backfill";
const DEX_API_TIMEOUT_MS = 10_000;
const REQUEST_DELAY_MS = 250;   // ~240 req/min — stays under DexScreener's 300/min cap
const FETCH_LIMIT = 2000;       // max tokens processed per run (re-run for more)
const PAGE_SIZE = 1000;         // db page size while scanning for target tokens

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
  const columns = "id, symbol, chain, contract_address, logo_url";

  if (FORCE_REFRESH) {
    const { data, error } = await supabase
      .from("tokens")
      .select(columns)
      .not("contract_address", "is", null)
      .order("created_at", { ascending: true })
      .limit(FETCH_LIMIT);

    if (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to load tokens", { error: error.message });
      return [];
    }
    return data ?? [];
  }

  // Default: collect tokens lacking a STABLE Storage logo (null or external).
  // Page through the table so unstable rows that sort after a page of already
  // stable ones are not missed.
  const targets = [];
  for (let from = 0; targets.length < FETCH_LIMIT; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tokens")
      .select(columns)
      .not("contract_address", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to load tokens", { error: error.message });
      break;
    }

    const rows = data ?? [];
    for (const token of rows) {
      if (!isStableAssetUrl(token.logo_url)) targets.push(token);
      if (targets.length >= FETCH_LIMIT) break;
    }

    if (rows.length < PAGE_SIZE) break; // reached the last page
  }

  return targets;
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
    // Belt-and-suspenders: never reprocess an already-stable logo unless forced.
    if (!FORCE_REFRESH && isStableAssetUrl(token.logo_url)) {
      unchanged++;
      continue;
    }

    const sourceUrl = await fetchLogoUrl(token.contract_address);

    if (!sourceUrl) {
      log(LOG_LEVELS.DEBUG, WORKER_NAME, "No logo available on DexScreener", {
        symbol: token.symbol,
        chain: token.chain
      });
      notFound++;
      await sleep(REQUEST_DELAY_MS);
      continue;
    }

    try {
      // Download the DexScreener image and store it in our bucket, keyed by
      // chain + contract_address. sourceUrl is only used to fetch the bytes.
      const { publicUrl } = await resolveAndStoreImage(supabase, {
        sourceUrl,
        pathPrefix: `tokens/${token.chain}/${normalizeContractForPath(token.contract_address)}`,
        fallbackExt: "png",
        fallbackContentType: "image/png"
      });

      const { error } = await supabase
        .from("tokens")
        .update({ logo_url: publicUrl })
        .eq("id", token.id);

      if (error) {
        log(LOG_LEVELS.ERROR, WORKER_NAME, "Failed to save logo_url", {
          symbol: token.symbol,
          error: error.message
        });
        failed++;
      } else {
        log(LOG_LEVELS.INFO, WORKER_NAME, "Logo stored", { symbol: token.symbol, chain: token.chain });
        updated++;
      }
    } catch (err) {
      // Download/storage failure for a single token must not stop the run.
      log(LOG_LEVELS.WARN, WORKER_NAME, "Failed to download/store logo", {
        symbol: token.symbol,
        chain: token.chain,
        error: err.message
      });
      failed++;
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
