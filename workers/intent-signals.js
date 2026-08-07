/**
 * External signal collectors for the KeluScore engine.
 *
 * Reuse note: workers/price-update.js already calls the Dexscreener token
 * endpoint, but only reads priceUsd, marketCap, chainId and info.imageUrl. It
 * discards volume, liquidity and info.socials. This module reads the SAME
 * endpoint and extracts the discarded fields. No new provider is introduced
 * and price-update.js is left completely untouched.
 *
 * Every collector follows the same contract:
 *   - resolve to a plain object of signals, or null when unavailable
 *   - never throw: a provider outage must not fail the scoring cycle
 *   - be independently skippable via configuration
 */

import axios from "axios";

import { LOG_LEVELS, log, toFiniteNumber, withRetry, isTransientHttpError } from "./worker-utils.js";

const DEXSCREENER_TOKEN_URL = "https://api.dexscreener.com/latest/dex/tokens/";
const DEX_TIMEOUT_MS = 10000;

/**
 * Collect liquidity, 24h volume and social presence for one token.
 *
 * Dexscreener returns every trading pair for a contract. We use the pair with
 * the deepest liquidity, which is the one a real buyer would route through.
 *
 * Returns null when the token has no contract address, the provider is down,
 * or the contract simply is not listed.
 */
export async function collectDexscreenerSignals(contractAddress, workerName) {
  if (!contractAddress) return null;

  try {
    const response = await withRetry(
      async () => {
        return await axios.get(DEXSCREENER_TOKEN_URL + encodeURIComponent(contractAddress), {
          timeout: DEX_TIMEOUT_MS
        });
      },
      {
        retries: 3,
        baseDelayMs: 1000,
        shouldRetry: isTransientHttpError,
        onRetry: (error, attempt, delayMs) => {
          log(LOG_LEVELS.WARN, workerName, "Dexscreener retry scheduled", {
            contractAddress,
            attempt,
            delayMs,
            error: error.message
          });
        }
      }
    );

    const pairs = response?.data?.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0) return null;

    // Deepest liquidity pair is the most representative of real tradability.
    let best = null;
    let bestLiquidity = -1;
    for (const pair of pairs) {
      const liquidity = toFiniteNumber(pair?.liquidity?.usd, 0) || 0;
      if (liquidity > bestLiquidity) {
        bestLiquidity = liquidity;
        best = pair;
      }
    }

    if (!best) return null;

    // info is omitted entirely on thin or brand new pairs.
    const info = best.info || {};
    const websites = Array.isArray(info.websites) ? info.websites : [];
    const socials = Array.isArray(info.socials) ? info.socials : [];

    let twitterHandleUrl = null;
    for (const social of socials) {
      const type = String(social?.type || social?.platform || "").toLowerCase();
      if (type === "twitter" || type === "x") {
        twitterHandleUrl = social?.url || null;
        break;
      }
    }

    return {
      liquidityUsd: toFiniteNumber(best?.liquidity?.usd, null),
      volume24hUsd: toFiniteNumber(best?.volume?.h24, null),
      priceChange24hPct: toFiniteNumber(best?.priceChange?.h24, null),
      hasWebsite: websites.length > 0,
      socialCount: socials.length,
      twitterUrl: twitterHandleUrl,
      pairAddress: best?.pairAddress || null,
      raw: {
        chainId: best?.chainId || null,
        dexId: best?.dexId || null,
        liquidityUsd: toFiniteNumber(best?.liquidity?.usd, null),
        volume24hUsd: toFiniteNumber(best?.volume?.h24, null),
        websiteCount: websites.length,
        socialCount: socials.length
      }
    };
  } catch (error) {
    log(LOG_LEVELS.WARN, workerName, "Dexscreener collection failed", {
      contractAddress,
      error: error.message
    });
    return null;
  }
}

/**
 * Collect audience size from X.
 *
 * Intentionally inert until X_BEARER_TOKEN is configured. The X API v2 has no
 * free tier for user lookup, so this returns null on every call until you add
 * a paid token. That keeps community_score honestly NULL rather than faked.
 *
 * When you are ready, set X_BEARER_TOKEN and this begins populating
 * project_signals with twitter_followers on the next cycle. No schema change
 * and no code change is required.
 */
export async function collectXSignals(twitterUrl, bearerToken, workerName) {
  if (!bearerToken || !twitterUrl) return null;

  const username = extractTwitterUsername(twitterUrl);
  if (!username) return null;

  try {
    const response = await withRetry(
      async () => {
        return await axios.get(
          "https://api.twitter.com/2/users/by/username/" + encodeURIComponent(username),
          {
            timeout: DEX_TIMEOUT_MS,
            params: { "user.fields": "public_metrics" },
            headers: { Authorization: "Bearer " + bearerToken }
          }
        );
      },
      {
        retries: 2,
        baseDelayMs: 2000,
        shouldRetry: isTransientHttpError
      }
    );

    const metrics = response?.data?.data?.public_metrics;
    if (!metrics) return null;

    return {
      twitterFollowers: toFiniteNumber(metrics.followers_count, null),
      twitterUsername: username,
      raw: metrics
    };
  } catch (error) {
    log(LOG_LEVELS.WARN, workerName, "X collection failed", {
      username,
      error: error.message
    });
    return null;
  }
}

/**
 * Pull a username out of an x.com or twitter.com URL without using a regex,
 * so the parsing stays obvious and has no escaping surprises.
 */
export function extractTwitterUsername(url) {
  if (!url || typeof url !== "string") return null;

  let working = url.trim();
  const schemeIndex = working.indexOf("://");
  if (schemeIndex !== -1) working = working.slice(schemeIndex + 3);

  const slashIndex = working.indexOf("/");
  if (slashIndex === -1) return null;

  let remainder = working.slice(slashIndex + 1);

  const queryIndex = remainder.indexOf("?");
  if (queryIndex !== -1) remainder = remainder.slice(0, queryIndex);

  const nextSlash = remainder.indexOf("/");
  if (nextSlash !== -1) remainder = remainder.slice(0, nextSlash);

  remainder = remainder.trim();
  if (remainder.length === 0) return null;
  if (remainder.charAt(0) === "@") remainder = remainder.slice(1);

  return remainder.length > 0 ? remainder : null;
}

/**
 * Flatten collector output into project_signals rows.
 */
export function toProjectSignalRows(tokenId, source, signals) {
  if (!signals) return [];

  const rows = [];
  const collectedAt = new Date().toISOString();

  const numericFields = [
    "liquidityUsd",
    "volume24hUsd",
    "priceChange24hPct",
    "socialCount",
    "twitterFollowers"
  ];

  for (const field of numericFields) {
    const value = signals[field];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    rows.push({
      token_id: tokenId,
      source,
      signal_type: toSnakeCase(field),
      value_numeric: value,
      value_text: null,
      payload: {},
      collected_at: collectedAt
    });
  }

  if (signals.hasWebsite !== undefined && signals.hasWebsite !== null) {
    rows.push({
      token_id: tokenId,
      source,
      signal_type: "has_website",
      value_numeric: signals.hasWebsite ? 1 : 0,
      value_text: null,
      payload: {},
      collected_at: collectedAt
    });
  }

  if (signals.raw) {
    rows.push({
      token_id: tokenId,
      source,
      signal_type: "snapshot",
      value_numeric: null,
      value_text: null,
      payload: signals.raw,
      collected_at: collectedAt
    });
  }

  return rows;
}

/**
 * camelCase to snake_case without a regex.
 */
export function toSnakeCase(value) {
  let output = "";
  for (const char of value) {
    const lower = char.toLowerCase();
    if (char !== lower && output.length > 0) output += "_";
    output += lower;
  }
  return output;
}
