/**
 * Detectors: MARKET_SOCIAL_DIVERGENCE / SENTIMENT_DIVERGENCE
 *
 * Divergence detectors compare the direction of one signal source to
 * another. They emit when the two sources disagree in a way the
 * engine wants to surface.
 *
 * MARKET_SOCIAL_DIVERGENCE
 * ------------------------
 * Compares CoinGecko 24h price change for BTC/ETH/SOL against the
 * Kelucalls call growth % for the last 24h vs the prior 24h. If the
 * market is up but call activity is down (or vice versa) by a
 * meaningful margin, the two are diverging.
 *
 * SENTIMENT_DIVERGENCE
 * --------------------
 * Compares the Fear & Greed 24h delta (today's value - yesterday's)
 * against the Kelucalls call growth %. If sentiment is rising but
 * activity is falling (or vice versa), the two are diverging.
 *
 * The score is the magnitude of the spread between the two normalized
 * sub-metrics. Confidence is high when both inputs are present and big
 * enough to be meaningful.
 */

import type {
  CoinSnapshot,
  DailyResearchSnapshot,
  FearGreedSnapshot
} from "../../types";
import type { ResearchSignal, SignalSourceReference } from "../types";
import {
  confidenceFromCompleteness,
  linearScore,
  normalizeScore,
  pctChange,
  round
} from "../math";

const DIVERGENCE_CURVE = [
  { input: 10, score: 35 },
  { input: 25, score: 60 },
  { input: 50, score: 80 },
  { input: 100, score: 95 }
] as const;

const DIVERGENCE_FLOOR_PCT = 10;

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

/**
 * Average 24h price change across all CoinGecko coins that report one.
 * Returns null when no coin has a usable change.
 */
function averageMarketChange(market: {
  btc: CoinSnapshot | null;
  eth: CoinSnapshot | null;
  sol: CoinSnapshot | null;
}): number | null {
  const values: number[] = [];
  for (const coin of [market.btc, market.eth, market.sol]) {
    const change = safeNumber(coin?.change24hPct);
    if (change !== null) values.push(change);
  }
  return average(values);
}

/**
 * Compute Fear & Greed delta (today - yesterday). Both readings must
 * have a numeric value for the delta to be defined.
 */
function fearGreedDelta(snapshot: FearGreedSnapshot | null): number | null {
  if (!snapshot) return null;
  const today = safeNumber(snapshot.current?.value);
  const yesterday = safeNumber(snapshot.previousDay?.value);
  if (today === null || yesterday === null) return null;
  return today - yesterday;
}

/**
 * Compute Kelucalls call growth % vs the prior 24h. Returns null when
 * either window's count is missing.
 */
function kelucallsCallGrowth(snapshot: DailyResearchSnapshot): number | null {
  const data = snapshot.kelucallsData;
  if (!data) return null;
  const last = safeNumber(data.callsLast24h);
  const previous = safeNumber(data.callsPrevious24h);
  if (last === null || previous === null) return null;
  return pctChange(last, previous);
}

function buildDivergenceSignal(args: {
  signalType: "MARKET_SOCIAL_DIVERGENCE" | "SENTIMENT_DIVERGENCE";
  socialGrowth: number;
  externalMetric: number;
  externalLabel: string;
  externalValue: number | null;
  sources: SignalSourceReference[];
  generatedAt: string;
  supportingExtras: Record<string, number | string | null>;
}): ResearchSignal | null {
  const { signalType, socialGrowth, externalMetric, sources, generatedAt } = args;

  // Sign agreement: divergence is the OPPOSITE of sign agreement. We
  // only emit when one is positive and the other negative, OR when
  // they're same-sign but very different in magnitude (magnitude
  // divergence).
  const opposite = socialGrowth * externalMetric < 0;
  const spread = opposite
    ? Math.abs(socialGrowth) + Math.abs(externalMetric)
    : Math.abs(socialGrowth - externalMetric);

  if (spread < DIVERGENCE_FLOOR_PCT) return null;

  const score = linearScore(spread, DIVERGENCE_CURVE);
  const primarySize = Math.max(Math.abs(socialGrowth), Math.abs(externalMetric));

  return {
    signal_type: signalType,
    direction: "divergence",
    score: normalizeScore(score),
    confidence: confidenceFromCompleteness(primarySize, primarySize * 0.5, 8),
    supporting_metrics: {
      kelucalls_call_growth_pct: round(socialGrowth, 1),
      external_metric_pct: round(externalMetric, 1),
      external_metric_name: args.externalLabel,
      external_metric_value: args.externalValue,
      divergence_type: opposite ? "opposite_sign" : "magnitude",
      spread_pct: round(spread, 1),
      ...args.supportingExtras
    },
    timestamp: generatedAt,
    source_references: sources
  };
}

export function detectMarketSocialDivergence(
  current: DailyResearchSnapshot,
  _baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const socialGrowth = kelucallsCallGrowth(current);
  if (socialGrowth === null) return [];

  const marketChange = averageMarketChange(current.marketData ?? { btc: null, eth: null, sol: null });
  if (marketChange === null) return [];

  const signal = buildDivergenceSignal({
    signalType: "MARKET_SOCIAL_DIVERGENCE",
    socialGrowth,
    externalMetric: marketChange,
    externalLabel: "coingecko_avg_24h_change_pct",
    externalValue: round(marketChange, 2),
    sources: ["kelucalls", "coingecko"],
    generatedAt,
    supportingExtras: {
      btc_change_pct: safeNumber(current.marketData?.btc?.change24hPct),
      eth_change_pct: safeNumber(current.marketData?.eth?.change24hPct),
      sol_change_pct: safeNumber(current.marketData?.sol?.change24hPct)
    }
  });

  return signal ? [signal] : [];
}

export function detectSentimentDivergence(
  current: DailyResearchSnapshot,
  _baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const socialGrowth = kelucallsCallGrowth(current);
  if (socialGrowth === null) return [];

  const fngDelta = fearGreedDelta(current.sentimentData);
  if (fngDelta === null) return [];

  // Map the F&G delta (which is on a 0-100 scale) to a comparable
  // percentage so the divergence math is unit-consistent. Alternative.me
  // publishes one reading per day, so a 5-point move is a notable move.
  // We treat 5 points as ~5% to keep the curve intuitive.
  const sentimentGrowthProxy = fngDelta;

  const signal = buildDivergenceSignal({
    signalType: "SENTIMENT_DIVERGENCE",
    socialGrowth,
    externalMetric: sentimentGrowthProxy,
    externalLabel: "fear_greed_24h_delta",
    externalValue: fngDelta,
    sources: ["kelucalls", "fear_greed"],
    generatedAt,
    supportingExtras: {
      fear_greed_today: current.sentimentData?.current?.value ?? null,
      fear_greed_yesterday: current.sentimentData?.previousDay?.value ?? null,
      fear_greed_classification: current.sentimentData?.current?.classification ?? null
    }
  });

  return signal ? [signal] : [];
}
