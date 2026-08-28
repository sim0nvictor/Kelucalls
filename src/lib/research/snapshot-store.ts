import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DailyResearchSnapshot,
  DailyResearchReport,
  DefiLlamaSnapshot,
  FearGreedSnapshot,
  KelucallsSnapshot,
  NewsResearchSnapshot,
  ResearchMarketSnapshot,
  ResearchProviderKey,
  ResearchProviderStatus,
  ResearchSignalsBlock
} from "./types";
import { validateDailyResearchReport } from "./validator";
import { getResearchMarketSnapshot } from "./sources/coingecko";
import { getDefiLlamaSnapshot } from "./sources/defillama";
import { getFearGreedSnapshot } from "./sources/fear-greed";
import { getKelucallsSnapshot } from "./sources/kelucalls";
import { collectNewsResearchSnapshot } from "./news";
import { runSignalEngine } from "./signals";

const PROVIDER_RETRIES = 3;
const PROVIDER_RETRY_DELAY_MS = 500;

async function retryProvider<T>(name: string, collect: () => Promise<T | null>): Promise<T | null> {
  for (let attempt = 1; attempt <= PROVIDER_RETRIES; attempt += 1) {
    const result = await collect();
    if (result !== null) return result;
    console.warn("[daily-research] provider failed", { provider: name, attempt });
    if (attempt < PROVIDER_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, PROVIDER_RETRY_DELAY_MS * attempt));
    }
  }
  return null;
}

type ResearchSnapshotRow = {
  id: string;
  snapshot_date: string;
  collected_at: string;
  market_data: ResearchMarketSnapshot | null;
  sentiment_data: FearGreedSnapshot | null;
  defi_data: DefiLlamaSnapshot | null;
  kelucalls_data: KelucallsSnapshot | null;
  news_data: NewsResearchSnapshot | null;
  signals: ResearchSignalsBlock | null;
  provider_status: DailyResearchSnapshot["providerStatus"];
  generated_report: DailyResearchReport | null;
  created_at: string;
};

function utcDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

function providerStatus(
  source: ResearchProviderKey,
  data: { fetchedAt?: string } | null,
  collectedAt: string
): ResearchProviderStatus {
  return {
    ok: data !== null,
    source,
    fetchedAt: data?.fetchedAt ?? collectedAt,
    error: data === null ? "provider returned no snapshot" : null
  };
}

/**
 * Reduce a daily research snapshot to the strict, persistable signal
 * block shape stored in JSONB. The runtime signal report keeps more
 * fields (source_references enum narrowing, etc.) but the column only
 * stores the keys downstream readers need.
 */
function toSignalBlock(
  snapshot: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignalsBlock | null {
  try {
    const report = runSignalEngine(snapshot, baseline, generatedAt);
    return {
      generatedAt: report.generatedAt,
      baselineSnapshotDate: report.baselineSnapshotDate,
      signalCount: report.signals.length,
      signals: report.signals.map((signal) => ({
        signal_type: signal.signal_type,
        direction: signal.direction,
        score: signal.score,
        confidence: signal.confidence,
        supporting_metrics: signal.supporting_metrics,
        timestamp: signal.timestamp,
        source_references: signal.source_references
      }))
    };
  } catch (error) {
    console.warn("[snapshot-store] signal engine failed", {
      reason: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

export async function collectDailyResearchSnapshot(
  supabase: SupabaseClient | null = null
): Promise<DailyResearchSnapshot> {
  const collectedAt = new Date().toISOString();
  const [marketData, sentimentData, defiData, kelucallsData, newsData] = await Promise.all([
    retryProvider("coingecko", getResearchMarketSnapshot),
    retryProvider("fear_greed", getFearGreedSnapshot),
    retryProvider("defillama", getDefiLlamaSnapshot),
    retryProvider("kelucalls", getKelucallsSnapshot),
    collectNewsResearchSnapshot()
  ]);

  const partialSnapshot: DailyResearchSnapshot = {
    snapshotDate: utcDate(collectedAt),
    collectedAt,
    marketData,
    sentimentData,
    defiData,
    kelucallsData,
    newsData,
    signals: null,
    providerStatus: {
      coingecko: providerStatus("coingecko", marketData, collectedAt),
      fear_greed: providerStatus("fear_greed", sentimentData, collectedAt),
      defillama: providerStatus("defillama", defiData, collectedAt),
      kelucalls: providerStatus("kelucalls", kelucallsData, collectedAt),
      ...newsData.providerStatus
    }
  };

  let baseline: DailyResearchSnapshot | null = null;
  if (supabase) {
    const yesterday = utcDate(
      new Date(Date.parse(collectedAt) - 24 * 3_600_000).toISOString()
    );
    try {
      const baselineRow = await readDailyResearchSnapshot(supabase, yesterday);
      baseline = baselineRow ? fromResearchSnapshotRow(baselineRow) : null;
    } catch (error) {
      console.warn("[snapshot-store] baseline read failed", {
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const signals = toSignalBlock(partialSnapshot, baseline, collectedAt);

  return {
    ...partialSnapshot,
    signals
  };
}

export function toResearchSnapshotInsert(snapshot: DailyResearchSnapshot) {
  return {
    snapshot_date: snapshot.snapshotDate,
    collected_at: snapshot.collectedAt,
    market_data: snapshot.marketData,
    sentiment_data: snapshot.sentimentData,
    defi_data: snapshot.defiData,
    kelucalls_data: snapshot.kelucallsData,
    news_data: snapshot.newsData,
    signals: snapshot.signals,
    provider_status: snapshot.providerStatus
  };
}

export function fromResearchSnapshotRow(row: ResearchSnapshotRow): DailyResearchSnapshot {
  return {
    snapshotDate: row.snapshot_date,
    collectedAt: row.collected_at,
    marketData: row.market_data,
    sentimentData: row.sentiment_data,
    defiData: row.defi_data,
    kelucallsData: row.kelucalls_data,
    newsData: row.news_data,
    signals: row.signals,
    providerStatus: row.provider_status
  };
}

export async function saveDailyResearchSnapshot(
  supabase: SupabaseClient,
  snapshot: DailyResearchSnapshot
): Promise<ResearchSnapshotRow> {
  const { data, error } = await supabase
    .from("research_snapshots")
    .upsert(toResearchSnapshotInsert(snapshot), {
      onConflict: "snapshot_date"
    })
    .select(
      "id,snapshot_date,collected_at,market_data,sentiment_data,defi_data,kelucalls_data,news_data,signals,provider_status,generated_report,created_at"
    )
    .single();

  if (error) {
    throw new Error(`Failed to save research snapshot: ${error.message}`);
  }

  return data as ResearchSnapshotRow;
}

export async function readDailyResearchSnapshot(
  supabase: SupabaseClient,
  snapshotDate: string
): Promise<ResearchSnapshotRow | null> {
  const { data, error } = await supabase
    .from("research_snapshots")
    .select(
      "id,snapshot_date,collected_at,market_data,sentiment_data,defi_data,kelucalls_data,news_data,signals,provider_status,generated_report,created_at"
    )
    .eq("snapshot_date", snapshotDate)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to read research snapshot: ${error.message}`);
  }

  return data as ResearchSnapshotRow;
}

export async function saveDailyResearchReport(
  supabase: SupabaseClient,
  snapshot: DailyResearchSnapshot,
  report: DailyResearchReport
): Promise<string> {
  const validation = validateDailyResearchReport(snapshot, report);
  if (!validation.valid) {
    throw new Error(`Research report is invalid and was not published: ${JSON.stringify(validation)}`);
  }

  const { data, error } = await supabase
    .from("research_snapshots")
    .update({ generated_report: report })
    .eq("snapshot_date", snapshot.snapshotDate)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to save research report: ${error.message}`);
  return String(data.id);
}
