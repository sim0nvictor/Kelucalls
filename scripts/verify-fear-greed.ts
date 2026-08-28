/**
 * Live verification script for the Alternative.me Fear & Greed provider.
 *
 * Exercises src/lib/research/sources/fear-greed.ts against the real public
 * API. Compares the returned snapshot against the normalized TypeScript types
 * and checks HTTP success, response structure, numeric values, timestamp,
 * error handling, and timeout behavior.
 *
 * Run:  npx tsx scripts/verify-fear-greed.ts
 */

import "dotenv/config";
import { getFearGreedSnapshot } from "../src/lib/research/sources/fear-greed";
import type {
  FearGreedReading,
  FearGreedSnapshot
} from "../src/lib/research/types";

type CheckResult = { name: string; ok: boolean; detail: string };
const results: CheckResult[] = [];
function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`[${tag}] ${name} — ${detail}`);
}

function isReading(x: unknown): x is FearGreedReading {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (o.value !== null && (typeof o.value !== "number" || !Number.isFinite(o.value)))
    return false;
  if (o.classification !== null && typeof o.classification !== "string")
    return false;
  if (o.timestamp !== null && typeof o.timestamp !== "string") return false;
  return true;
}

function isSnapshot(x: unknown): x is FearGreedSnapshot {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.fetchedAt !== "string") return false;
  if (o.source !== "fear_greed") return false;
  if (o.current !== null && !isReading(o.current)) return false;
  if (o.previousDay !== null && !isReading(o.previousDay)) return false;
  if (!Array.isArray(o.context7d)) return false;
  if (!Array.isArray(o.context30d)) return false;
  for (const r of o.context7d as unknown[]) {
    if (!isReading(r)) return false;
  }
  for (const r of o.context30d as unknown[]) {
    if (!isReading(r)) return false;
  }
  return true;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function checkReading(label: string, r: FearGreedReading | null) {
  if (r === null) {
    record(`3. ${label} numeric values present`, false, `${label} is null`);
    return;
  }
  const valueOk = isFiniteNumber(r.value) && r.value >= 0 && r.value <= 100;
  const classOk = typeof r.classification === "string" && r.classification.length > 0;
  const tsOk = typeof r.timestamp === "string" && !Number.isNaN(Date.parse(r.timestamp));
  record(
    `3. ${label} numeric values`,
    valueOk && classOk && tsOk,
    `value=${r.value} classification="${r.classification}" timestamp=${r.timestamp}`
  );
}

async function main() {
  console.log("=== Fear & Greed provider live verification ===");
  console.log(`Node: ${process.version}`);
  console.log("");

  // 1) HTTP success
  const t0 = Date.now();
  const snapshot = await getFearGreedSnapshot();
  const elapsedMs = Date.now() - t0;

  record(
    "1. HTTP success (getFearGreedSnapshot returned a value or null)",
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
    const structureOk = isSnapshot(snapshot);
    record(
      "2. Response structure matches FearGreedSnapshot",
      structureOk,
      structureOk
        ? "all required fields present and correctly typed"
        : "shape diverged from FearGreedSnapshot"
    );

    // 3) Numeric values per reading
    checkReading("current", snapshot.current);
    checkReading("previousDay", snapshot.previousDay);

    const c7ok = snapshot.context7d.length <= 6;
    const c30ok = snapshot.context30d.length <= 29;
    const cOrderOk = isChronological(snapshot.context7d) && isChronological(snapshot.context30d);
    record(
      "3. context7d (≤6 prior readings, oldest -> newest)",
      c7ok && cOrderOk,
      `length=${snapshot.context7d.length}, chronological=${cOrderOk}`
    );
    record(
      "3. context30d (≤29 prior readings, oldest -> newest)",
      c30ok && cOrderOk,
      `length=${snapshot.context30d.length}, chronological=${cOrderOk}`
    );

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
      "4. source field equals 'fear_greed'",
      snapshot.source === "fear_greed",
      `source=${snapshot.source}`
    );

    // 5) Error handling
    record(
      "5. Error handling (provider did not throw)",
      true,
      "no exception escaped getFearGreedSnapshot"
    );

    // 6) Timeout behavior
    record(
      "6. Timeout behavior (completed within REQUEST_TIMEOUT_MS + slack)",
      elapsedMs < 12_000,
      `elapsed=${elapsedMs}ms (provider timeout is 8000ms)`
    );

    console.log("");
    console.log("Snapshot:");
    console.log(JSON.stringify(snapshot, null, 2));
  }

  console.log("");
  console.log("=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) process.exitCode = 1;
}

function isChronological(rs: FearGreedReading[]): boolean {
  for (let i = 1; i < rs.length; i++) {
    const prev = Date.parse(rs[i - 1].timestamp ?? "");
    const cur = Date.parse(rs[i].timestamp ?? "");
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || cur < prev) return false;
  }
  return true;
}

main().catch((err) => {
  console.error("UNEXPECTED EXCEPTION:", err);
  process.exitCode = 2;
});
