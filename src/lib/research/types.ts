/**
 * Normalized types for the Daily Research data pipeline.
 *
 * IMPORTANT
 * --------
 * The rest of Kelucalls (callers, future workers, future API routes) MUST
 * depend on the shapes declared in this file, NOT on any provider-specific
 * response structure (CoinGecko, DeFiLlama, Fear & Greed, etc.). Providers
 * live under src/lib/research/sources/ and translate their raw payloads into
 * these types.
 *
 * That isolation is the whole point of having a `sources/` folder: a provider
 * can be swapped, rate-limited, or removed without the engine knowing.
 *
 * If a new field is needed, add it here first and have each provider populate
 * it (with null when the source does not report it).
 */

/** Where a normalized value came from. */
export type ResearchSource = "coingecko" | "defillama" | "fear_greed" | "kelucalls";

export type ResearchCategory =
  | "crypto"
  | "geopolitics"
  | "economics"
  | "technology"
  | "ai"
  | "regulation"
  | "macro";

export type ResearchSourceType = "market_data" | "sentiment" | "defi" | "news";

export type NewsSource = "newsapi" | "gdelt" | "coindesk" | "cointelegraph" | "techcrunch_ai";

export interface ResearchEntity {
  type: "asset" | "organization" | "person" | "place" | "topic";
  value: string;
}

export interface ResearchItem {
  id: string;
  source: NewsSource;
  source_type: "news";
  title: string;
  url: string;
  published_at: string;
  collected_at: string;
  category: ResearchCategory;
  description: string | null;
  summary: string | null;
  entities: ResearchEntity[];
}

export interface NewsProviderStatus {
  ok: boolean;
  source: NewsSource;
  fetchedAt: string;
  itemCount: number;
  error: string | null;
}

export interface NewsResearchSnapshot {
  items: ResearchItem[];
  providerStatus: Partial<Record<NewsSource, NewsProviderStatus>>;
  fetchedAt: string;
  source: "news";
}

/**
 * A single Alternative.me Fear & Greed reading.
 *
 * The value is normalized to a number 0-100, but stored as `number | null`
 * for symmetry with the other providers (callers must tolerate nulls).
 */
export interface FearGreedReading {
  /** Integer 0-100. null when the source did not report a parsable value. */
  value: number | null;
  /** Human label, e.g. "Greed", "Fear", "Neutral". null when missing. */
  classification: string | null;
  /** ISO timestamp of when the reading was taken. null when missing. */
  timestamp: string | null;
}

/**
 * A snapshot of the Alternative.me Fear & Greed Index for the Daily Research
 * Engine.
 *
 * The index publishes one reading per day, so:
 *   - `current` is today's reading (the most recent in the response).
 *   - `previousDay` is yesterday's reading, when available.
 *   - `context7d` is a rolling 7-day window (excluding today) so the engine
 *     can compute average / change without re-fetching.
 *   - `context30d` is a rolling 30-day window (excluding today) for the
 *     same reason. The array is ordered oldest -> newest within each
 *     context window so consumers can iterate chronologically.
 *
 * Every field is nullable so the worker can decide how to degrade gracefully
 * when the source is missing data.
 */
export interface FearGreedSnapshot {
  current: FearGreedReading | null;
  previousDay: FearGreedReading | null;
  /** Up to 6 most recent prior readings (yesterday + 5 earlier days). */
  context7d: FearGreedReading[];
  /** Up to 29 most recent prior readings (for a 30-day lookback). */
  context30d: FearGreedReading[];
  /** ISO timestamp of when this snapshot was assembled. */
  fetchedAt: string;
  /** Which provider produced this snapshot. */
  source: "fear_greed";
}

/** Price, 24h change, and market cap for a single coin in USD. */
export interface CoinSnapshot {
  /** Provider-agnostic symbol, uppercased. e.g. "BTC", "ETH", "SOL". */
  symbol: string;
  /** Provider-agnostic id for this snapshot. For CoinGecko this is the coin id. */
  coinId: string;
  /** Spot price in USD. null when the source did not report one. */
  priceUsd: number | null;
  /** 24h price change as a percentage. null when the source did not report one. */
  change24hPct: number | null;
  /** Fully diluted or circulating market cap in USD. null when unavailable. */
  marketCapUsd: number | null;
}

/** Global crypto market metrics. */
export interface GlobalMarketSnapshot {
  /** Total crypto market cap in USD. */
  totalMarketCapUsd: number | null;
  /** Total 24h trading volume in USD across the whole market. */
  totalVolume24hUsd: number | null;
  /** BTC dominance as a percentage (0-100). */
  btcDominancePct: number | null;
}

/**
 * A point-in-time snapshot of the data the Daily Research Engine needs.
 *
 * All numeric fields are nullable. Providers fill in what they have; callers
 * must tolerate nulls and degrade gracefully.
 */
export interface ResearchMarketSnapshot {
  btc: CoinSnapshot | null;
  eth: CoinSnapshot | null;
  sol: CoinSnapshot | null;
  global: GlobalMarketSnapshot | null;
  /** ISO timestamp of when this snapshot was assembled. */
  fetchedAt: string;
  /** Which provider produced this snapshot. */
  source: ResearchSource;
}

/**
 * TVL for a single chain at a single point in time, in USD.
 */
export interface ChainTvl {
  /** Provider-agnostic chain name. Matches DeFiLlama's `name` field, e.g. "Ethereum". */
  name: string;
  /** Chain's native token symbol, when known. e.g. "ETH", "SOL". null otherwise. */
  tokenSymbol: string | null;
  /** Total value locked on this chain right now, in USD. */
  tvlUsd: number | null;
}

/**
 * Total DeFi TVL across every chain at a single point in time, in USD,
 * plus percentage change over the lookback windows that DeFiLlama's
 * `historicalChainTvl` series lets us derive for free.
 */
export interface TotalTvl {
  /** Total DeFi TVL in USD at the time of the snapshot. */
  totalUsd: number | null;
  /** 24h change as a percentage (e.g. -1.42 means -1.42%). null when unknown. */
  change24hPct: number | null;
  /** 7d change as a percentage. null when unknown. */
  change7dPct: number | null;
  /** 30d change as a percentage. null when unknown. */
  change30dPct: number | null;
  /** ISO timestamp of the data point, derived from the API's Unix date. null when missing. */
  timestamp: string | null;
}

/**
 * One stablecoin's circulating supply snapshot, in USD. DeFiLlama reports
 * the supply normalized to `peggedUSD` regardless of the coin's own peg
 * (USD, EUR, etc.) which is exactly what a research engine wants.
 */
export interface StablecoinAsset {
  /** Provider-agnostic symbol, uppercased. e.g. "USDT", "USDC". */
  symbol: string;
  /** Display name, e.g. "Tether". */
  name: string;
  /** Current circulating supply in USD. */
  circulatingUsd: number | null;
  /** 24h change as a percentage. null when the source did not report a previous day. */
  change24hPct: number | null;
  /** 7d change as a percentage. null when the source did not report a previous week. */
  change7dPct: number | null;
  /** 30d change as a percentage. null when the source did not report a previous month. */
  change30dPct: number | null;
}

/**
 * A normalized DeFiLlama snapshot for the Daily Research Engine.
 *
 * Only the data DeFiLlama provides freely is included. The provider pulls:
 *   - `v2/chains` for per-chain current TVL
 *   - `v2/historicalChainTvl` for total TVL and lookback changes
 *   - `stablecoins.llama.fi/stablecoins` for stablecoin supply + changes
 *
 * Every list is best-effort: any field a source does not report is null,
 * and the whole snapshot returns null when every endpoint fails.
 */
export interface DefiLlamaSnapshot {
  totalTvl: TotalTvl | null;
  /** Major chains we care about. Other chains from `v2/chains` are dropped. */
  chainTvl: ChainTvl[];
  /** Stablecoin supply + change windows. Largest N by circulating supply. */
  stablecoins: StablecoinAsset[];
  /** ISO timestamp of when this snapshot was assembled. */
  fetchedAt: string;
  /** Which provider produced this snapshot. */
  source: "defillama";
}

export type ResearchProviderKey = "coingecko" | "fear_greed" | "defillama" | "kelucalls" | NewsSource;

/**
 * Per-token call activity snapshot for a single Kelucalls data cycle.
 *
 * `uniqueChannelsPerToken` is the count of distinct channels that called the
 * token across all visible calls - mirrors `trending_tokens.unique_channels`
 * but exposed explicitly for the engine.
 *
 * `averageRoiPct` and `bestMultiple` are computed from the same rows the
 * trending_tokens materialized view aggregates, so they match what the public
 * dashboard already shows.
 */
export interface KelucallsTokenMetric {
  tokenId: string;
  symbol: string;
  name: string | null;
  chain: string;
  contractAddress: string | null;
  totalCalls: number;
  uniqueChannels: number;
  averageRoiPct: number | null;
  bestMultiple: number | null;
  lastCalledAt: string | null;
}

/**
 * Per-channel call activity snapshot for a single Kelucalls data cycle.
 *
 * `callVelocity` and `previous24hCalls` reuse the channel's totals
 * (active channels, calls in the current 24h, calls in the prior 24h) so
 * the engine can rank channels by how fast they are calling new tokens.
 */
export interface KelucallsChannelMetric {
  channelId: string;
  slug: string;
  title: string;
  totalCalls: number | null;
  winRatePct: number | null;
  averageRoiPct: number | null;
  bestMultiple: number | null;
  lastCallAt: string | null;
  callsLast24h: number;
  callsPrevious24h: number;
  callVelocity: number;
}

/**
 * A token whose first visible call happened recently - it is "new" or
 * "emerging" relative to the rest of the dataset. The provider surfaces
 * this list so the engine can render it without recomputing the cutoff.
 */
export interface KelucallsEmergingToken {
  tokenId: string;
  symbol: string;
  name: string | null;
  chain: string;
  contractAddress: string | null;
  firstCalledAt: string;
  totalCalls: number;
  uniqueChannels: number;
  hoursSinceFirstCall: number;
}

/**
 * A normalized Kelucalls internal research snapshot.
 *
 * All numbers are computed deterministically from existing Kelucalls tables
 * (calls, call_metrics, channels, channel_stats, trending_tokens). No LLM is
 * asked to calculate any value. The provider falls back to null on any
 * underlying Supabase failure so the worker can degrade gracefully.
 */
export interface KelucallsSnapshot {
  /** Count of calls in the most recent 24h window. null on failure. */
  callsLast24h: number | null;
  /** Count of calls in the prior 24h window (24h-48h ago). null on failure. */
  callsPrevious24h: number | null;
  /** Number of active/paused channels that have at least one visible call. */
  activeChannels: number | null;
  /** Distinct tokens called in the last 24h. */
  uniqueTokensLast24h: number | null;
  /** Mean number of distinct channels per token called in the last 24h. */
  averageUniqueChannelsPerTokenLast24h: number | null;
  /** Mean of call_metrics.current_roi_pct across calls in the last 24h. */
  averageRoiPctLast24h: number | null;
  /** Maximum call_metrics.peak_multiple across calls in the last 24h. */
  bestMultipleLast24h: number | null;
  /** tokens.active = true with the highest call volume in the last 24h. */
  trendingTokens: KelucallsTokenMetric[];
  /** active/paused channels ranked by recent call volume. */
  channelPerformance: KelucallsChannelMetric[];
  /** Tokens whose first call landed in the last 24h. */
  newTokens: KelucallsEmergingToken[];
  /**
   * Tokens called in the last 24h whose first visible call is older than
   * 24h but who are only NOW attracting their second+ channel.
   */
  emergingTokens: KelucallsEmergingToken[];
  /** calls_last_24h - calls_previous_24h. Deterministic. */
  callVelocity: number | null;
  /** active_channels_calling_last_24h - active_channels_calling_previous_24h. */
  channelVelocity: number | null;
  /** ISO timestamp of when this snapshot was assembled. */
  fetchedAt: string;
  /** Provider discriminator. Always "kelucalls". */
  source: "kelucalls";
}

export interface ResearchProviderStatus {
  ok: boolean;
  source: ResearchProviderKey;
  fetchedAt: string;
  error: string | null;
}

/**
 * The deterministic Signal Engine output for a single daily research
 * cycle. Forward-imported from `signals/types` to avoid a module cycle
 * (the signals module already imports from this file).
 */
export interface ResearchSignalsBlock {
  generatedAt: string;
  baselineSnapshotDate: string | null;
  signalCount: number;
  signals: Array<{
    signal_type: string;
    direction: string;
    score: number;
    confidence: string;
    supporting_metrics: Record<string, number | string | null>;
    timestamp: string;
    source_references: string[];
  }>;
}

export interface DailyResearchSnapshot {
  snapshotDate: string;
  collectedAt: string;
  marketData: ResearchMarketSnapshot | null;
  sentimentData: FearGreedSnapshot | null;
  defiData: DefiLlamaSnapshot | null;
  kelucallsData: KelucallsSnapshot | null;
  newsData: NewsResearchSnapshot | null;
  /**
   * Deterministic signals derived from the snapshot's own provider
   * payloads. Computed by `runSignalEngine` after the collectors
   * finish; never derived by an LLM. May be null when the engine has
   * not been run for this cycle (e.g. on legacy rows or when the
   * engine itself errored out).
   */
  signals: ResearchSignalsBlock | null;
  providerStatus: Partial<Record<ResearchProviderKey, ResearchProviderStatus>>;
}

export const DAILY_RESEARCH_SECTION_KEYS = [
  "executive_summary",
  "global_macro_context",
  "crypto_market_snapshot",
  "fear_and_greed",
  "technology_ai",
  "geopolitical_economic_developments",
  "kol_narrative_intelligence",
  "kelucalls_intelligence",
  "cross_layer_signals",
  "emerging_narratives",
  "risks_contradicting_evidence",
  "conclusion"
] as const;

export type DailyResearchSectionKey = (typeof DAILY_RESEARCH_SECTION_KEYS)[number];

export interface DailyResearchSection {
  content: string;
  evidence: string[];
}

export interface DailyResearchSource {
  source: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
}

export interface DailyResearchReport {
  schemaVersion: 1;
  snapshotDate: string;
  collectedAt: string;
  generatedAt: string;
  sections: Record<DailyResearchSectionKey, DailyResearchSection>;
  sources: DailyResearchSource[];
  financialDisclaimer: string;
}

export interface ResearchReportValidationError {
  code: string;
  message: string;
  location: string;
}

export interface VerifiedResearchClaim {
  claim: string;
  location: string;
  sourcePaths: string[];
}

export interface ResearchReportValidationResult {
  valid: boolean;
  errors: ResearchReportValidationError[];
  warnings: string[];
  verified_claims: VerifiedResearchClaim[];
}
