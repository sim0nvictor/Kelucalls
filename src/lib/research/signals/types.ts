/**
 * Deterministic Signal Engine types.
 *
 * The Signal Engine runs after the Daily Research collectors finish. It
 * reads normalized provider snapshots (Kelucalls, CoinGecko, DeFiLlama,
 * Fear & Greed, news) and emits structured signals WITHOUT calling any
 * LLM. Every score, confidence, and supporting metric is derived from
 * arithmetic over the same numbers the collectors already produced.
 *
 * Public surface
 * --------------
 *   ResearchSignal
 *     - signal_type     discriminator (one of SignalType)
 *     - direction       'up' | 'down' | 'neutral' | 'divergence' | 'confirmation'
 *     - score           0-100 normalized strength of the signal
 *     - confidence      'low' | 'medium' | 'high' based on data completeness
 *     - supporting_metrics  the raw numbers the detector used
 *     - timestamp       ISO timestamp the signal was produced
 *     - source_references  the providers (kelucalls, coingecko, ...) that
 *                          contributed data to the detection
 *
 * Determinism contract
 * --------------------
 * Given identical DailyResearchSnapshot inputs, the engine MUST emit the
 * same set of signals with identical scores, confidence, and metrics. The
 * detectors are pure functions; no Date.now(), no random IDs, no I/O.
 * `timestamp` is supplied by the caller so the engine itself stays pure.
 *
 * Baseline windows
 * ----------------
 * Several detectors compare the latest snapshot against a prior baseline
 * to decide "increasing" vs "decreasing". The baseline is the same shape
 * as a DailyResearchSnapshot but represents yesterday's collection. The
 * engine degrades gracefully when the baseline is missing (signals that
 * require a baseline are dropped, not fabricated).
 */

export type SignalType =
  | "TOKEN_ATTENTION_RISING"
  | "TOKEN_ATTENTION_FALLING"
  | "CHANNEL_PARTICIPATION_RISING"
  | "TOKEN_ACTIVITY_ACCELERATION"
  | "CALL_VELOCITY_ANOMALY"
  | "MARKET_SOCIAL_DIVERGENCE"
  | "SENTIMENT_DIVERGENCE"
  | "NARRATIVE_ACCELERATION"
  | "CROSS_SOURCE_CONFIRMATION";

export type SignalDirection = "up" | "down" | "neutral" | "divergence" | "confirmation";

export type SignalConfidence = "low" | "medium" | "high";

/**
 * Source discriminator for a single research source.
 *
 * Re-uses the existing ResearchSource enum from ./types where possible
 * (coingecko, defillama, fear_greed, kelucalls) and adds 'news' for the
 * news-provider collection as a whole. Per-provider news sources (newsapi,
 * gdelt, coindesk, cointelegraph, techcrunch_ai) are listed as 'news'
 * because the engine does not differentiate between them when reasoning
 * about cross-source confirmation.
 */
export type SignalSourceReference = "coingecko" | "defillama" | "fear_greed" | "kelucalls" | "news";

/**
 * A single deterministic research signal.
 *
 * `supportingMetrics` is intentionally untyped at the interface level so
 * every signal type can carry the exact numbers its detector used (token
 * growth %, call growth %, F&G delta, etc.). Consumers should switch on
 * `signalType` to narrow the metric shape.
 */
export interface ResearchSignal {
  signal_type: SignalType;
  direction: SignalDirection;
  /**
   * Normalized strength of the signal on a 0-100 scale. Higher = stronger
   * evidence for the signal's claim. The scale is comparable across
   * detectors of the same family (e.g. all TOKEN_ATTENTION_RISING
   * signals are scored against the same growth curve) but not across
   * different signal types — do not compare a CROSS_SOURCE_CONFIRMATION
   * score against a CALL_VELOCITY_ANOMALY score.
   */
  score: number;
  confidence: SignalConfidence;
  supporting_metrics: Record<string, number | string | null>;
  /** ISO timestamp the signal was produced. */
  timestamp: string;
  /**
   * Providers that contributed to this signal. Order is stable: the
   * first entry is the primary source.
   */
  source_references: SignalSourceReference[];
}

/**
 * A collection of signals produced for one detection cycle.
 *
 * `baselineDate` is set when the engine used a prior snapshot to compute
 * deltas. It is null for the very first collection (no baseline exists
 * yet). Consumers can use it to decide whether to display a "vs
 * yesterday" annotation.
 */
export interface ResearchSignalReport {
  generatedAt: string;
  baselineSnapshotDate: string | null;
  signals: ResearchSignal[];
}
