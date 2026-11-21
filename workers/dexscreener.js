/**
 * Shared DexScreener pair selection.
 *
 * A token contract can have several pools. Select the deepest liquid pool
 * with a valid USD price, preferring an exact chain match. Never silently
 * use a different known chain when the requested chain is known.
 */

export function normalizeDexChain(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["solana", "sol"].includes(normalized)) return "solana";
  if (["ethereum", "eth"].includes(normalized)) return "ethereum";
  if (["bsc", "bnb", "binance-smart-chain"].includes(normalized)) return "bsc";
  if (["base"].includes(normalized)) return "base";
  if (["arbitrum", "arb"].includes(normalized)) return "arbitrum";
  if (["polygon", "matic"].includes(normalized)) return "polygon";
  if (["avalanche", "avax"].includes(normalized)) return "avalanche";
  if (["sui"].includes(normalized)) return "sui";
  if (["tron", "trx"].includes(normalized)) return "tron";
  return "other";
}

function positiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function liquidityScore(pair) {
  const liquidity = Number(pair?.liquidity?.usd);
  return Number.isFinite(liquidity) && liquidity > 0 ? liquidity : 0;
}

function volumeScore(pair) {
  const volume = Number(pair?.volume?.h24);
  return Number.isFinite(volume) && volume > 0 ? volume : 0;
}

/**
 * Returns { pair, reason }.
 * reason is null on success, otherwise one of: no_pairs, chain_mismatch,
 * invalid_price.
 */
export function selectDexPair(pairs, expectedChain) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return { pair: null, reason: "no_pairs" };
  }

  const requestedChain = normalizeDexChain(expectedChain);
  const validChainPairs = requestedChain === "other"
    ? pairs
    : pairs.filter((pair) => normalizeDexChain(pair?.chainId) === requestedChain);

  if (validChainPairs.length === 0) {
    return { pair: null, reason: "chain_mismatch" };
  }

  const pricedPairs = validChainPairs.filter((pair) => positiveNumber(pair?.priceUsd) !== null);
  if (pricedPairs.length === 0) {
    return { pair: null, reason: "invalid_price" };
  }

  pricedPairs.sort((left, right) =>
    liquidityScore(right) - liquidityScore(left) ||
    volumeScore(right) - volumeScore(left)
  );

  return { pair: pricedPairs[0], reason: null };
}

export function parseDexPairSnapshot(pair) {
  if (!pair) return null;
  const priceUsd = positiveNumber(pair.priceUsd);
  if (priceUsd === null) return null;

  const marketCap = Number(pair.marketCap);
  const marketCapUsd = Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null;

  return {
    priceUsd,
    marketCapUsd,
    chain: normalizeDexChain(pair.chainId),
    logoUrl: pair.info?.imageUrl ?? null,
    pairAddress: pair.pairAddress ?? null,
    liquidityUsd: liquidityScore(pair),
    dexId: pair.dexId ?? null,
  };
}
