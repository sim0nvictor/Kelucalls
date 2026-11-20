import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normalizeDexChain,
  parseDexPairSnapshot,
  selectDexPair,
} from "./dexscreener.js";

test("normalizes DexScreener chain aliases", () => {
  assert.equal(normalizeDexChain("sol"), "solana");
  assert.equal(normalizeDexChain("eth"), "ethereum");
  assert.equal(normalizeDexChain("binance-smart-chain"), "bsc");
  assert.equal(normalizeDexChain("unknown-chain"), "other");
});

test("selects the deepest liquid pair on the requested chain", () => {
  const pairs = [
    { chainId: "ethereum", priceUsd: "2", liquidity: { usd: 900_000 } },
    { chainId: "solana", priceUsd: "1", liquidity: { usd: 10_000 } },
    { chainId: "solana", priceUsd: "1.5", liquidity: { usd: 50_000 } },
  ];

  const result = selectDexPair(pairs, "solana");
  assert.equal(result.reason, null);
  assert.equal(result.pair.priceUsd, "1.5");
});

test("ignores pairs without a valid positive USD price", () => {
  const pairs = [
    { chainId: "base", priceUsd: null, liquidity: { usd: 900_000 } },
    { chainId: "base", priceUsd: "0", liquidity: { usd: 500_000 } },
    { chainId: "base", priceUsd: "0.0000042", liquidity: { usd: 10_000 } },
  ];

  const result = selectDexPair(pairs, "base");
  assert.equal(result.reason, null);
  assert.equal(result.pair.priceUsd, "0.0000042");
});

test("does not silently fall back to a different known chain", () => {
  const result = selectDexPair([
    { chainId: "ethereum", priceUsd: "1", liquidity: { usd: 100_000 } },
  ], "solana");

  assert.equal(result.pair, null);
  assert.equal(result.reason, "chain_mismatch");
});

test("reports missing pairs and invalid prices separately", () => {
  assert.equal(selectDexPair([], "solana").reason, "no_pairs");
  assert.equal(selectDexPair([{ chainId: "solana", priceUsd: null }], "solana").reason, "invalid_price");
});

test("parses price and uses FDV only when market cap is absent", () => {
  const snapshot = parseDexPairSnapshot({
    chainId: "base",
    priceUsd: "0.000001",
    marketCap: null,
    fdv: 125_000,
    liquidity: { usd: 8_000 },
    info: { imageUrl: "https://example.com/token.png" },
  });

  assert.deepEqual(snapshot, {
    priceUsd: 0.000001,
    marketCapUsd: 125_000,
    chain: "base",
    logoUrl: "https://example.com/token.png",
    pairAddress: null,
    liquidityUsd: 8_000,
    dexId: null,
  });
});
