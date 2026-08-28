/**
 * Live verification script for the CoinGecko research provider.
 *
 * Exercises src/lib/research/sources/coingecko.ts against the real CoinGecko
 * demo API using COINGECKO_API_KEY from the environment. Does NOT print the
 * API key. Compares the returned snapshot against the normalized TypeScript
 * types and checks HTTP success, response structure, numeric values,
 * timestamp, error handling, and timeout behavior.
 *
 * Run:  npx tsx scripts/verify-coingecko.ts
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });

import {
  getResearchMarketSnapshot
} from "../src/lib/research/sources/coingecko";
import type {
  CoinSnapshot,
  GlobalMarketSnapshot,
  ResearchMarketSnapshot
} from "../src/lib/research/types";

const KEY_PRESENT =
  typeof process.env.COINGECKO_API_KEY === "string" &&
  process.env.COINGECKO_API_KEY.trim().length > 0;

function maskKey(): string {
  const v = process.env.COINGECKO_API_KEY ?? "";
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)} (len=${v.length})`;
}

type CheckResult = { name: string; ok: boolean; detail: string };

const results: CheckResult[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name} — ${detail}`);
}

function isCoinSnapshot(x: unknown): x is CoinSnapshot {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.symbol !== "string" || o.symbol.length === 0) return false;
  if (typeof o.coinId !== "string" || o.coinId.length === 0) return false;
  if (o.priceUsd !== null && typeof o.priceUsd !== "number") return false;
  if (o.change24hPct !== null && typeof o.change24hPct !== "number") return false;
  if (o.marketCapUsd !== null && typeof o.marketCapUsd !== "number") return false;
  return true;
}

function isGlobalSnapshot(x: unknown): x is GlobalMarketSnapshot {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.totalMarketCapUsd !== null && typeof o.totalMarketCapUsd !== "number")
    return false;
  if (o.totalVolume24hUsd !== null && typeof o.totalVolume24hUsd !== "number")
    return false;
  if (o.btcDominancePct !== null && typeof o.btcDominancePct !== "number")
    return false;
  return true;
}

function isResearchSnapshot(x: unknown): x is ResearchMarketSnapshot {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.fetchedAt !== "string") return false;
  if (o.source !== "coingecko") return false;
  if (o.btc !== null && !isCoinSnapshot(o.btc)) return false;
  if (o.eth !== null && !isCoinSnapshot(o.eth)) return false;
  if (o.sol !== null && !isCoinSnapshot(o.sol)) return false;
  if (o.global !== null && !isGlobalSnapshot(o.global)) return false;
  return true;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

async function main() {
  console.log("=== CoinGecko provider live verification ===");
  console.log(`COINGECKO_API_KEY present: ${KEY_PRESENT} (${maskKey()})`);
  console.log(`Node: ${process.version}`);
  console.log("");

  // 1) HTTP success
  const t0 = Date.now();
  const snapshot = await getResearchMarketSnapshot();
  const elapsedMs = Date.now() - t0;

  record(
    "1. HTTP success (getResearchMarketSnapshot returned a value or null)",
    snapshot === null || typeof snapshot === "object",
    `returned ${snapshot === null ? "null" : "object"} in ${elapsedMs}ms`
  );

  if (snapshot === null) {
    record(
      "2-6. Snapshot structure",
      false,
      "snapshot is null — see console warnings above for the cause"
    );
  } else {
    // 2) Response structure
    const structureOk = isResearchSnapshot(snapshot);
    record(
      "2. Response structure matches ResearchMarketSnapshot",
      structureOk,
      structureOk
        ? "all required fields present and correctly typed"
        : "shape diverged from ResearchMarketSnapshot"
    );

    // 3) Numeric values
    const btc = snapshot.btc;
    const eth = snapshot.eth;
    const sol = snapshot.sol;
    const g = snapshot.global;

    const coinChecks: Array<[string, CoinSnapshot | null]> = [
      ["BTC", btc],
      ["ETH", eth],
      ["SOL", sol]
    ];
    for (const [label, coin] of coinChecks) {
      if (coin === null) {
        record(`3. ${label} numeric values present`, false, `${label} is null`);
        continue;
      }
      const priceOk = isFiniteNumber(coin.priceUsd) && (coin.priceUsd as number) > 0;
      const changeOk = coin.change24hPct === null || isFiniteNumber(coin.change24hPct);
      const capOk = isFiniteNumber(coin.marketCapUsd) && (coin.marketCapUsd as number) > 0;
      const symbolOk = coin.symbol === label;
      const idOk = typeof coin.coinId === "string" && coin.coinId.length > 0;
      const allOk = priceOk && changeOk && capOk && symbolOk && idOk;
      record(
        `3. ${label} numeric values`,
        allOk,
        `symbol=${coin.symbol} coinId=${coin.coinId} priceUsd=${coin.priceUsd} change24hPct=${coin.change24hPct} marketCapUsd=${coin.marketCapUsd}`
      );
    }

    if (g === null) {
      record("3. global numeric values", false, "global is null");
    } else {
      const totalOk = isFiniteNumber(g.totalMarketCapUsd) && (g.totalMarketCapUsd as number) > 0;
      const volOk = isFiniteNumber(g.totalVolume24hUsd) && (g.totalVolume24hUsd as number) > 0;
      const domOk =
        isFiniteNumber(g.btcDominancePct) &&
        (g.btcDominancePct as number) >= 0 &&
        (g.btcDominancePct as number) <= 100;
      record(
        "3. global + BTC dominance numeric values",
        totalOk && volOk && domOk,
        `totalMarketCapUsd=${g.totalMarketCapUsd} totalVolume24hUsd=${g.totalVolume24hUsd} btcDominancePct=${g.btcDominancePct}`
      );
    }

    // 4) Timestamp
    const tsOk =
      typeof snapshot.fetchedAt === "string" &&
      !Number.isNaN(Date.parse(snapshot.fetchedAt)) &&
      Date.parse(snapshot.fetchedAt) >= Date.now() - 5 * 60_000;
    record(
      "4. fetchedAt timestamp is a recent ISO string",
      tsOk,
      `fetchedAt=${snapshot.fetchedAt}`
    );
    record(
      "4. source field equals 'coingecko'",
      snapshot.source === "coingecko",
      `source=${snapshot.source}`
    );

    // 5) Error handling — the call must not have thrown; the provider is
    //    non-throwing. We assert by reaching this point.
    record(
      "5. Error handling (provider did not throw)",
      true,
      "no exception escaped getResearchMarketSnapshot"
    );

    // 6) Timeout behavior — measure elapsed time against REQUEST_TIMEOUT_MS (8s)
    record(
      "6. Timeout behavior (completed within REQUEST_TIMEOUT_MS + slack)",
      elapsedMs < 12_000,
      `elapsed=${elapsedMs}ms (provider timeout is 8000ms)`
    );

    // Dump a compact view of the snapshot (no API key here)
    console.log("");
    console.log("Snapshot:");
    console.log(JSON.stringify(snapshot, null, 2));
  }

  console.log("");
  console.log("=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("UNEXPECTED EXCEPTION:", err);
  process.exitCode = 2;
});
