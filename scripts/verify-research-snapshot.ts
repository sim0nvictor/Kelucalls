/**
 * Live verification for Daily Research Snapshot persistence.
 *
 * Collects real provider data, saves one service-role row into
 * public.research_snapshots, reads it back, and validates the stored payload.
 *
 * Run: npx tsx scripts/verify-research-snapshot.ts
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
  ResearchProviderStatus
} from "../src/lib/research/types";

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

function isRecentIso(value: string): boolean {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= Date.now() - 10 * 60_000;
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
    !Number.isNaN(Date.parse(recordValue.fetchedAt)) &&
    (recordValue.error === null || typeof recordValue.error === "string")
  );
}

function validateSnapshot(snapshot: DailyResearchSnapshot): boolean {
  const statuses = snapshot.providerStatus;
  const statusOk =
    isProviderStatus("coingecko", statuses.coingecko) &&
    isProviderStatus("fear_greed", statuses.fear_greed) &&
    isProviderStatus("defillama", statuses.defillama) &&
    isProviderStatus("kelucalls", statuses.kelucalls) &&
    isProviderStatus("newsapi", statuses.newsapi) &&
    isProviderStatus("gdelt", statuses.gdelt) &&
    isProviderStatus("coindesk", statuses.coindesk) &&
    isProviderStatus("cointelegraph", statuses.cointelegraph) &&
    isProviderStatus("techcrunch_ai", statuses.techcrunch_ai);

  const sourceOk =
    (snapshot.marketData === null || snapshot.marketData.source === "coingecko") &&
    (snapshot.sentimentData === null || snapshot.sentimentData.source === "fear_greed") &&
    (snapshot.defiData === null || snapshot.defiData.source === "defillama") &&
    (snapshot.kelucallsData === null || snapshot.kelucallsData.source === "kelucalls") &&
    (snapshot.newsData === null || snapshot.newsData.source === "news");

  const timestampsOk =
    isRecentIso(snapshot.collectedAt) &&
    (snapshot.marketData === null || !Number.isNaN(Date.parse(snapshot.marketData.fetchedAt))) &&
    (snapshot.sentimentData === null ||
      !Number.isNaN(Date.parse(snapshot.sentimentData.fetchedAt))) &&
    (snapshot.defiData === null || !Number.isNaN(Date.parse(snapshot.defiData.fetchedAt))) &&
    (snapshot.kelucallsData === null ||
      !Number.isNaN(Date.parse(snapshot.kelucallsData.fetchedAt))) &&
    (snapshot.newsData === null || !Number.isNaN(Date.parse(snapshot.newsData.fetchedAt))) &&
    (snapshot.newsData === null ||
      snapshot.newsData.items.every(
        (item) =>
          item.url.length > 0 &&
          item.title.length > 0 &&
          item.source_type === "news" &&
          !Number.isNaN(Date.parse(item.published_at)) &&
          !Number.isNaN(Date.parse(item.collected_at))
      ));

  return statusOk && sourceOk && timestampsOk;
}

async function main() {
  console.log("=== Daily Research Snapshot live verification ===");

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
    console.log("");
    console.log("Apply supabase/migrations/010_research_snapshots.sql, then rerun this script.");
    process.exitCode = 1;
    return;
  }

  const snapshot = await collectDailyResearchSnapshot();
  record(
    "Collector returned a valid snapshot envelope",
    validateSnapshot(snapshot),
    `date=${snapshot.snapshotDate} collectedAt=${snapshot.collectedAt}`
  );

  const saved = await saveDailyResearchSnapshot(supabase, snapshot);
  record(
    "Live insertion/upsert succeeded",
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
    const datesMatch =
      stored.snapshotDate === snapshot.snapshotDate && stored.collectedAt === snapshot.collectedAt;
    const storedOk = validateSnapshot(stored);
    const payloadsMatch =
      JSON.stringify(stored.marketData) === JSON.stringify(snapshot.marketData) &&
      JSON.stringify(stored.sentimentData) === JSON.stringify(snapshot.sentimentData) &&
      JSON.stringify(stored.defiData) === JSON.stringify(snapshot.defiData) &&
      JSON.stringify(stored.kelucallsData) === JSON.stringify(snapshot.kelucallsData) &&
      JSON.stringify(stored.newsData) === JSON.stringify(snapshot.newsData);

    record(
      "Stored dates and timestamps preserved",
      datesMatch,
      `storedDate=${stored.snapshotDate} storedCollectedAt=${stored.collectedAt}`
    );
    record(
      "Stored provider status/provenance valid",
      storedOk,
      JSON.stringify(stored.providerStatus)
    );
    record(
      "Stored provider payloads match collected payloads",
      payloadsMatch,
      `market=${stored.marketData !== null} sentiment=${stored.sentimentData !== null} defi=${stored.defiData !== null} newsItems=${stored.newsData?.items.length ?? 0}`
    );
  }

  console.log("");
  console.log("=== Summary ===");
  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  console.log(`${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("UNEXPECTED EXCEPTION:", error);
  process.exitCode = 2;
});
