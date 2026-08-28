/**
 * Live verification for the deterministic Signal Engine.
 *
 * Collects a real DailyResearchSnapshot, runs the engine against an
 * optional baseline (yesterday's stored snapshot if present), saves
 * the enriched snapshot, and reads it back. Validates that:
 *
 *   - signals block is present and structurally valid
 *   - every signal carries the required fields
 *   - scores are in [0, 100] and confidence is one of the enum values
 *   - the block survives a round-trip to Supabase unchanged
 *
 * Run: npx tsx scripts/verify-signal-engine.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: false });

import {
  collectDailyResearchSnapshot,
  fromResearchSnapshotRow,
  readDailyResearchSnapshot,
  saveDailyResearchSnapshot
} from "../src/lib/research/snapshot-store";
import type {
  DailyResearchSnapshot,
  ResearchProviderKey,
  ResearchProviderStatus,
  ResearchSignalsBlock
} from "../src/lib/research/types";
import { runSignalEngine } from "../src/lib/research/signals";

type CheckResult = { name: string; ok: boolean; detail: string };

const results: CheckResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name} - ${detail}`);
}

function getEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : null;
}

function isProviderStatus(
  source: ResearchProviderKey,
  value: unknown
): value is ResearchProviderStatus {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const recordValue = value as Record<string, unknown>;
  return (
    typeof recordValue.ok === "boolean" &&
    recordValue.source === source &&
    typeof recordValue.fetchedAt === "string" &&
    (recordValue.error === null || typeof recordValue.error === "string")
  );
}

const VALID_SIGNAL_TYPES = new Set<string>([
  "TOKEN_ATTENTION_RISING",
  "TOKEN_ATTENTION_FALLING",
  "CHANNEL_PARTICIPATION_RISING",
  "TOKEN_ACTIVITY_ACCELERATION",
  "CALL_VELOCITY_ANOMALY",
  "MARKET_SOCIAL_DIVERGENCE",
  "SENTIMENT_DIVERGENCE",
  "NARRATIVE_ACCELERATION",
  "CROSS_SOURCE_CONFIRMATION"
]);

const VALID_DIRECTIONS = new Set(["up", "down", "neutral", "divergence", "confirmation"]);
const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);

function validateSignal(signal: unknown): { ok: boolean; reason: string } {
  if (typeof signal !== "object" || signal === null || Array.isArray(signal)) {
    return { ok: false, reason: "not an object" };
  }
  const s = signal as Record<string, unknown>;
  if (!VALID_SIGNAL_TYPES.has(String(s.signal_type))) {
    return { ok: false, reason: `bad signal_type ${String(s.signal_type)}` };
  }
  if (!VALID_DIRECTIONS.has(String(s.direction))) {
    return { ok: false, reason: `bad direction ${String(s.direction)}` };
  }
  if (typeof s.score !== "number" || !Number.isFinite(s.score) || s.score < 0 || s.score > 100) {
    return { ok: false, reason: `bad score ${String(s.score)}` };
  }
  if (!VALID_CONFIDENCE.has(String(s.confidence))) {
    return { ok: false, reason: `bad confidence ${String(s.confidence)}` };
  }
  if (typeof s.supporting_metrics !== "object" || s.supporting_metrics === null) {
    return { ok: false, reason: "missing supporting_metrics" };
  }
  if (typeof s.timestamp !== "string" || Number.isNaN(Date.parse(s.timestamp))) {
    return { ok: false, reason: "bad timestamp" };
  }
  if (!Array.isArray(s.source_references) || s.source_references.length === 0) {
    return { ok: false, reason: "missing source_references" };
  }
  return { ok: true, reason: "ok" };
}

function validateSignalsBlock(block: ResearchSignalsBlock | null): boolean {
  if (!block) return false;
  if (typeof block.generatedAt !== "string") return false;
  if (block.baselineSnapshotDate !== null && typeof block.baselineSnapshotDate !== "string") {
    return false;
  }
  if (typeof block.signalCount !== "number" || block.signalCount !== block.signals.length) {
    return false;
  }
  return block.signals.every((signal) => validateSignal(signal).ok);
}

function validateSnapshotEnvelope(snapshot: DailyResearchSnapshot): boolean {
  const statuses = snapshot.providerStatus;
  const statusOk =
    isProviderStatus("coingecko", statuses.coingecko) &&
    isProviderStatus("fear_greed", statuses.fear_greed) &&
    isProviderStatus("defillama", statuses.defillama) &&
    isProviderStatus("kelucalls", statuses.kelucalls);

  return statusOk;
}

async function main() {
  console.log("=== Signal Engine live verification ===");

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") ?? getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? getEnv("SUPABASE_KEY");

  record("Supabase URL present", url !== null, url ? "configured" : "missing");
  record("Service role key present", key !== null, key ? "configured" : "missing");
  if (!url || !key) {
    process.exitCode = 1;
    return;
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const probe = await supabase.from("research_snapshots").select("id").limit(1);
  record(
    "research_snapshots table reachable",
    !probe.error,
    probe.error ? probe.error.message : "service-role select succeeded"
  );
  if (probe.error) {
    process.exitCode = 1;
    return;
  }

  // Engine must be pure: same input -> same output, twice.
  const todayProbe = await readDailyResearchSnapshot(
    supabase,
    new Date().toISOString().slice(0, 10)
  );

  const snapshot = await collectDailyResearchSnapshot(supabase);
  record(
    "Collector returned a valid snapshot envelope",
    validateSnapshotEnvelope(snapshot),
    `date=${snapshot.snapshotDate}`
  );

  // Engine determinism: run the engine twice on the SAME snapshot and
  // confirm the resulting blocks are byte-identical. Pure function
  // contract.
  const generatedAt = new Date().toISOString();
  const reportA = runSignalEngine(snapshot, null, generatedAt);
  const reportB = runSignalEngine(snapshot, null, generatedAt);
  const deterministic =
    JSON.stringify(reportA) === JSON.stringify(reportB) &&
    reportA.signals.every(
      (signal, idx) =>
        signal.signal_type === reportB.signals[idx].signal_type &&
        signal.score === reportB.signals[idx].score
    );
  record(
    "Engine is deterministic across runs",
    deterministic,
    `first=${reportA.signals.length} signals second=${reportB.signals.length} signals`
  );

  // Use the engine's own output (via the snapshot-store) for validation.
  const signals = snapshot.signals;
  record(
    "Snapshot includes a signals block",
    signals !== null,
    signals ? `signalCount=${signals.signalCount}` : "missing"
  );

  if (signals) {
    const valid = validateSignalsBlock(signals);
    record(
      "Signals block is structurally valid",
      valid,
      `count=${signals.signals.length} baselineDate=${signals.baselineSnapshotDate ?? "(none)"}`
    );

    const types = Array.from(new Set(signals.signals.map((s) => s.signal_type))).sort();
    console.log("    detected signal types:", types.join(", ") || "(none)");

    for (const signal of signals.signals) {
      const v = validateSignal(signal);
      if (!v.ok) {
        record(`Signal ${signal.signal_type} shape`, false, v.reason);
      }
    }
    record(
      "All signals have valid numeric scores in [0, 100]",
      signals.signals.every((s) => s.score >= 0 && s.score <= 100),
      `min=${Math.min(...signals.signals.map((s) => s.score))} max=${Math.max(...signals.signals.map((s) => s.score))}`
    );
  }

  const saved = await saveDailyResearchSnapshot(supabase, snapshot);
  record(
    "Live insertion/upsert with signals succeeded",
    Boolean(saved.id),
    `id=${saved.id} snapshot_date=${saved.snapshot_date}`
  );

  const readBack = await readDailyResearchSnapshot(supabase, snapshot.snapshotDate);
  record(
    "Read-back by snapshot_date succeeded",
    readBack !== null,
    readBack ? `id=${readBack.id}` : "row missing"
  );

  if (readBack) {
    const stored = fromResearchSnapshotRow(readBack);
    record(
      "Stored signals block is structurally valid",
      validateSignalsBlock(stored.signals),
      `count=${stored.signals?.signals.length ?? 0}`
    );
    const signalsMatch = JSON.stringify(stored.signals) === JSON.stringify(snapshot.signals);
    record(
      "Stored signals match in-memory signals",
      signalsMatch,
      signalsMatch
        ? `${stored.signals?.signals.length ?? 0} signals preserved`
        : "mismatch"
    );

    if (todayProbe) {
      const probeEnvelope = fromResearchSnapshotRow(todayProbe);
      record(
        "Today's prior row still has a parseable envelope",
        validateSnapshotEnvelope(probeEnvelope),
        `id=${todayProbe.id}`
      );
    }
  }

  console.log("");
  console.log("=== Summary ===");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("UNEXPECTED EXCEPTION:", error);
  process.exitCode = 2;
});
