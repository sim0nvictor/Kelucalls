/**
 * Detectors: TOKEN_ATTENTION_RISING / TOKEN_ATTENTION_FALLING
 *
 * Aggregate detector: how much token attention (calls + unique channels
 * + tokens called) is the dataset seeing right now vs the prior window?
 *
 * Inputs
 * ------
 *   - current.kelucallsData.{callsLast24h, uniqueTokensLast24h,
 *     averageUniqueChannelsPerTokenLast24h, callVelocity, channelVelocity}
 *   - baseline.kelucallsData (same shape, prior cycle)
 *
 * Logic
 * -----
 * Three sub-metrics contribute equally to the "attention" score:
 *   1. call growth %       (callsLast24h vs baseline callsLast24h)
 *   2. token breadth growth %  (uniqueTokensLast24h vs baseline)
 *   3. channel depth growth %  (averageUniqueChannelsPerTokenLast24h
 *                               vs baseline)
 *
 * If the average of the three is positive and above a 5% floor, emit
 * TOKEN_ATTENTION_RISING. If it is negative past the same floor, emit
 * TOKEN_ATTENTION_FALLING. Otherwise drop (the dataset is flat).
 *
 * Score is mapped from the magnitude of the average growth so a +200%
 * swing scores higher than a +30% swing. Confidence is high when all
 * three inputs are present and big enough to be statistically
 * meaningful; medium when only one or two are present.
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

const ATTENTION_RISING_CURVE = [
  { input: 5, score: 25 },
  { input: 25, score: 55 },
  { input: 75, score: 80 },
  { input: 150, score: 95 }
] as const;

const ATTENTION_FALLING_CURVE = [
  { input: -5, score: 25 },
  { input: -25, score: 55 },
  { input: -50, score: 80 },
  { input: -75, score: 95 }
] as const;

const SIGNIFICANT_FLOOR_PCT = 5;

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function detectTokenAttention(
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const currentData = current.kelucallsData;
  if (!currentData) return [];

  const currentCalls = safeNumber(currentData.callsLast24h);
  const currentUniqueTokens = safeNumber(currentData.uniqueTokensLast24h);
  const currentAvgChannels = safeNumber(currentData.averageUniqueChannelsPerTokenLast24h);

  if (currentCalls === null || currentUniqueTokens === null || currentAvgChannels === null) {
    return [];
  }

  const baselineData = baseline?.kelucallsData;
  const baselineCalls = safeNumber(baselineData?.callsLast24h);
  const baselineUniqueTokens = safeNumber(baselineData?.uniqueTokensLast24h);
  const baselineAvgChannels = safeNumber(baselineData?.averageUniqueChannelsPerTokenLast24h);

  const callGrowth = baselineCalls === null ? null : pctChange(currentCalls, baselineCalls);
  const tokenGrowth =
    baselineUniqueTokens === null ? null : pctChange(currentUniqueTokens, baselineUniqueTokens);
  const channelDepthGrowth =
    baselineAvgChannels === null ? null : pctChange(currentAvgChannels, baselineAvgChannels);

  const presentGrowth = [callGrowth, tokenGrowth, channelDepthGrowth].filter(
    (value): value is number => value !== null
  );
  if (presentGrowth.length === 0) return [];

  const avgGrowth = presentGrowth.reduce((sum, value) => sum + value, 0) / presentGrowth.length;
  if (Math.abs(avgGrowth) < SIGNIFICANT_FLOOR_PCT) return [];

  const sources: SignalSourceReference[] = ["kelucalls"];
  const confidence = confidenceFromCompleteness(currentCalls, baselineCalls, 10);

  if (avgGrowth > 0) {
    const score = linearScore(avgGrowth, ATTENTION_RISING_CURVE);
    return [
      {
        signal_type: "TOKEN_ATTENTION_RISING",
        direction: "up",
        score: normalizeScore(score),
        confidence,
        supporting_metrics: {
          calls_24h: currentCalls,
          previous_calls_24h: baselineCalls,
          unique_tokens_24h: currentUniqueTokens,
          previous_unique_tokens_24h: baselineUniqueTokens,
          avg_channels_per_token: round(currentAvgChannels, 2),
          previous_avg_channels_per_token:
            baselineAvgChannels === null ? null : round(baselineAvgChannels, 2),
          call_growth_pct: callGrowth === null ? null : round(callGrowth, 1),
          token_growth_pct: tokenGrowth === null ? null : round(tokenGrowth, 1),
          channel_depth_growth_pct:
            channelDepthGrowth === null ? null : round(channelDepthGrowth, 1),
          avg_growth_pct: round(avgGrowth, 1),
          call_velocity: currentData.callVelocity,
          channel_velocity: currentData.channelVelocity
        },
        timestamp: generatedAt,
        source_references: sources
      }
    ];
  }

  const score = linearScore(avgGrowth, ATTENTION_FALLING_CURVE);
  return [
    {
      signal_type: "TOKEN_ATTENTION_FALLING",
      direction: "down",
      score: normalizeScore(score),
      confidence,
      supporting_metrics: {
        calls_24h: currentCalls,
        previous_calls_24h: baselineCalls,
        unique_tokens_24h: currentUniqueTokens,
        previous_unique_tokens_24h: baselineUniqueTokens,
        avg_channels_per_token: round(currentAvgChannels, 2),
        previous_avg_channels_per_token:
          baselineAvgChannels === null ? null : round(baselineAvgChannels, 2),
        call_growth_pct: callGrowth === null ? null : round(callGrowth, 1),
        token_growth_pct: tokenGrowth === null ? null : round(tokenGrowth, 1),
        channel_depth_growth_pct:
          channelDepthGrowth === null ? null : round(channelDepthGrowth, 1),
        avg_growth_pct: round(avgGrowth, 1),
        call_velocity: currentData.callVelocity,
        channel_velocity: currentData.channelVelocity
      },
      timestamp: generatedAt,
      source_references: sources
    }
  ];
}
