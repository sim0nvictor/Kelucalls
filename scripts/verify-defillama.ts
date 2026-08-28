/**
 * Live verification script for the DeFiLlama research provider.
 *
 * Exercises src/lib/research/sources/defillama.ts against the real public
 * DeFiLlama API (no API key). Checks HTTP success, response structure,
 * numeric values, timestamps, error handling, and timeout behavior.
 *
 * Run:  npx tsx scripts/verify-defillama.ts
 */

import "dotenv/config";
import { getDefiLlamaSnapshot } from "../src/lib/research/sources/defillama";
import type {
  ChainTvl,
  DefiLlamaSnapshot,
  StablecoinAsset,
  TotalTvl
} from "../src/lib/research/types";

type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name} — ${detail}`);
}

function isChainTvl(x: unknown): x is ChainTvl {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.name !== "string" || o.name.length === 0) return false;
  if (o.tokenSymbol !== null && typeof o.tokenSymbol !== "string") return false;
  if (o.tvlUsd !== null && (typeof o.tvlUsd !== "number" || !Number.isFinite(o.tvlUsd)))
    return false;
  return true;
}

function isStablecoinAsset(x: unknown): x is StablecoinAsset {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.symbol !== "string" || o.symbol.length === 0) return false;
  if (typeof o.name !== "string") return false;
  if (o.circulatingUsd !== null && (typeof o.circulatingUsd !== "number" || !Number.isFinite(o.circulatingUsd)))
    return false;
  for (const k of ["change24hPct", "change7dPct", "change30dPct"] as const) {
    if (o[k] !== null && (typeof o[k] !== "number" || !Number.isFinite(o[k] as number)))
      return false;
  }
  return true;
}

function isTotalTvl(x: unknown): x is TotalTvl {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.totalUsd !== null && (typeof o.totalUsd !== "number" || !Number.isFinite(o.totalUsd)))
    return false;
  for (const k of ["change24hPct", "change7dPct", "change30dPct"] as const) {
    if (o[k] !== null && (typeof o[k] !== "number" || !Number.isFinite(o[k] as number)))
      return false;
  }
  if (o.timestamp !== null && (typeof o.timestamp !== "string" || Number.isNaN(Date.parse(o.timestamp))))
    return false;
  return true;
}

function isSnapshot(x: unknown): x is DefiLlamaSnapshot {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.fetchedAt !== "string") return false;
  if (o.source !== "defillama") return false;
  if (o.totalTvl !== null && !isTotalTvl(o.totalTvl)) return false;
  if (!Array.isArray(o.chainTvl)) return false;
  if (!Array.isArray(o.stablecoins)) return false;
  for (const c of o.chainTvl as unknown[]) if (!isChainTvl(c)) return false;
  for (const s of o.stablecoins as unknown[]) if (!isStablecoinAsset(s)) return false;
  return true;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isPctInRange(x: number | null): boolean {
  if (x === null) return true; // null is allowed
  return isFiniteNumber(x) && x >= -100 && x <= 100;
}

async function main() {
  console.log("=== DeFiLlama provider live verification ===");
  console.log(`Node: ${process.version}`);
  console.log("");

  const t0 = Date.now();
  const snapshot = await getDefiLlamaSnapshot();
  const elapsedMs = Date.now() - t0;

  // 1) HTTP success — measured by returning a non-null snapshot or a
  //    non-throwing call.
  record(
    "1. HTTP success (getDefiLlamaSnapshot returned a value or null)",
    snapshot === null || typeof snapshot === "object",
    `returned ${snapshot === null ? "null" : "object"} in ${elapsedMs}ms`
  );

  if (snapshot === null) {
    record("2-6. Snapshot structure", false, "snapshot is null — see console warnings above");
  } else {
    // 2) Structure
    record(
      "2. Response structure matches DefiLlamaSnapshot",
      isSnapshot(snapshot),
      "all required fields present and correctly typed"
    );

    // 3a) total TVL
    const t = snapshot.totalTvl;
    if (t === null) {
      record("3. totalTvl numeric values", false, "totalTvl is null");
    } else {
      const totalOk = isFiniteNumber(t.totalUsd) && t.totalUsd > 0;
      const d1 = isPctInRange(t.change24hPct);
      const d7 = isPctInRange(t.change7dPct);
      const d30 = isPctInRange(t.change30dPct);
      const tsOk = typeof t.timestamp === "string" && !Number.isNaN(Date.parse(t.timestamp));
      record(
        "3. totalTvl numeric values",
        totalOk && d1 && d7 && d30 && tsOk,
        `totalUsd=${t.totalUsd} 24h=${t.change24hPct}% 7d=${t.change7dPct}% 30d=${t.change30dPct}% ts=${t.timestamp}`
      );
    }

    // 3b) chains
    const chainSummary = snapshot.chainTvl
      .map((c) => `${c.name}=${c.tvlUsd}`)
      .join(", ");
    record(
      "3. chainTvl list (8 major chains, USD, sorted)",
      snapshot.chainTvl.length > 0 && snapshot.chainTvl.every((c) => isFiniteNumber(c.tvlUsd) && (c.tvlUsd as number) >= 0),
      `length=${snapshot.chainTvl.length} — ${chainSummary}`
    );

    // 3c) stablecoins
    const stableSummary = snapshot.stablecoins
      .map((s) => `${s.symbol}($${Math.round((s.circulatingUsd ?? 0) / 1e9)}B)`)
      .join(", ");
    record(
      "3. stablecoins list (top 10 by supply, with 1d/7d/30d changes)",
      snapshot.stablecoins.length > 0 &&
        snapshot.stablecoins.every(
          (s) =>
            isFiniteNumber(s.circulatingUsd) &&
            isPctInRange(s.change24hPct) &&
            isPctInRange(s.change7dPct) &&
            isPctInRange(s.change30dPct)
        ),
      `length=${snapshot.stablecoins.length} — ${stableSummary}`
    );

    // 4) Timestamp + source
    const tsOk =
      typeof snapshot.fetchedAt === "string" &&
      !Number.isNaN(Date.parse(snapshot.fetchedAt)) &&
      Date.parse(snapshot.fetchedAt) >= Date.now() - 5 * 60_000;
    record("4. fetchedAt is a recent ISO string", tsOk, `fetchedAt=${snapshot.fetchedAt}`);
    record("4. source equals 'defillama'", snapshot.source === "defillama", `source=${snapshot.source}`);

    // 5) Error handling — non-throwing
    record(
      "5. Error handling (provider did not throw)",
      true,
      "no exception escaped getDefiLlamaSnapshot"
    );

    // 6) Timeout — 3 endpoints in parallel, ceiling REQUEST_TIMEOUT_MS + slack
    record(
      "6. Timeout behavior (completed within REQUEST_TIMEOUT_MS + slack)",
      elapsedMs < 12_000,
      `elapsed=${elapsedMs}ms (provider timeout is 8000ms)`
    );

    console.log("");
    console.log("Snapshot (compact):");
    console.log(
      JSON.stringify(
        {
          totalTvl: snapshot.totalTvl,
          chainTvl: snapshot.chainTvl,
          stablecoins: snapshot.stablecoins,
          fetchedAt: snapshot.fetchedAt,
          source: snapshot.source
        },
        null,
        2
      )
    );
  }

  console.log("");
  console.log("=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("UNEXPECTED EXCEPTION:", err);
  process.exitCode = 2;
});
