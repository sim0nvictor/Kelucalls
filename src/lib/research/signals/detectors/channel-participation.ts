/**
 * Detector: CHANNEL_PARTICIPATION_RISING
 *
 * Aggregate detector: more channels are calling more tokens right now
 * than they were in the prior cycle. The signal combines:
 *
 *   - active channels calling in last 24h vs previous 24h
 *   - average channels per token (breadth) vs previous
 *   - call velocity (callsLast24h - callsPrevious24h)
 *
 * Logic
 * -----
 * We require positive growth on at least TWO of the three sub-metrics,
 * and the overall average growth must clear a 5% floor. A channel that
 * just started firing at a higher rate (high channelVelocity) without
 * also broadening the token set is NOT participation-rising — that's
 * captured by CALL_VELOCITY_ANOMALY instead.
 *
 * Confidence is high when all three inputs are present.
 */

import type { DailyResearchSnapshot } from "../../types";
import type { ResearchSignal, SignalSourceReference } from "../types";
import {
  confidenceFromCompleteness,
  linearScore,
  normalizeScore,
  pctChange,
  round
} from "../math";

const PARTICIPATION_CURVE = [
  { input: 5, score: 25 },
  { input: 15, score: 50 },
  { input: 35, score: 75 },
  { input: 75, score: 95 }
] as const;

const SIGNIFICANT_FLOOR_PCT = 5;
const REQUIRED_POSITIVE_SUBMETRICS = 2;

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function detectChannelParticipationRising(
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const currentData = current.kelucallsData;
  if (!currentData) return [];

  const currentCalls = safeNumber(currentData.callsLast24h);
  const currentAvgChannels = safeNumber(currentData.averageUniqueChannelsPerTokenLast24h);
  const currentChannelVelocity = safeNumber(currentData.channelVelocity);

  if (currentCalls === null || currentAvgChannels === null) return [];

  const baselineData = baseline?.kelucallsData;
  const baselineCalls = safeNumber(baselineData?.callsLast24h);
  const baselineAvgChannels = safeNumber(baselineData?.averageUniqueChannelsPerTokenLast24h);

  const callGrowth = baselineCalls === null ? null : pctChange(currentCalls, baselineCalls);
  const breadthGrowth =
    baselineAvgChannels === null ? null : pctChange(currentAvgChannels, baselineAvgChannels);

  const presentMetrics = [callGrowth, breadthGrowth].filter(
    (value): value is number => value !== null
  );
  if (presentMetrics.length === 0) return [];

  const positiveCount = presentMetrics.filter((value) => value > 0).length;
  if (positiveCount < REQUIRED_POSITIVE_SUBMETRICS) return [];

  const avgGrowth = presentMetrics.reduce((sum, value) => sum + value, 0) / presentMetrics.length;
  if (avgGrowth < SIGNIFICANT_FLOOR_PCT) return [];

  const score = linearScore(avgGrowth, PARTICIPATION_CURVE);
  const confidence = confidenceFromCompleteness(currentCalls, baselineCalls, 10);

  return [
    {
      signal_type: "CHANNEL_PARTICIPATION_RISING",
      direction: "up",
      score: normalizeScore(score),
      confidence,
      supporting_metrics: {
        calls_24h: currentCalls,
        previous_calls_24h: baselineCalls,
        call_growth_pct: callGrowth === null ? null : round(callGrowth, 1),
        avg_channels_per_token: round(currentAvgChannels, 2),
        previous_avg_channels_per_token:
          baselineAvgChannels === null ? null : round(baselineAvgChannels, 2),
        breadth_growth_pct: breadthGrowth === null ? null : round(breadthGrowth, 1),
        channel_velocity: currentChannelVelocity,
        active_channels: currentData.activeChannels,
        positive_submetrics: positiveCount
      },
      timestamp: generatedAt,
      source_references: ["kelucalls" satisfies SignalSourceReference]
    }
  ];
}
