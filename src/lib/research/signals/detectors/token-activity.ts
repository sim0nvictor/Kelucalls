/**
 * Detector: TOKEN_ACTIVITY_ACCELERATION
 *
 * Per-token detector: a single token is firing a lot of calls across
 * many channels in the last 24h, far above its prior-24h baseline.
 *
 * Inputs
 * ------
 *   - current trending tokens (kelucallsData.trendingTokens)
 *   - baseline trending tokens (baseline.kelucallsData.trendingTokens)
 *
 * Logic
 * -----
 * For each token that appears in BOTH the current and baseline trending
 * lists, compute the per-token call growth % and the per-token channel
 * growth %. Average those two growth rates; if the average is positive
 * AND above the size floor, emit a TOKEN_ACTIVITY_ACCELERATION signal
 * carrying both growth numbers, the absolute call/channel counts, and
 * the timestamp of the most recent call.
 *
 * The signal's score is the average growth rate mapped through a
 * piece-wise linear curve so very large accelerations earn scores near
 * 100 while modest ones earn lower scores. Confidence is high when the
 * token is in the top of the trending list, medium when it's smaller.
 */

import type {
  DailyResearchSnapshot,
  KelucallsTokenMetric
} from "../../types";
import type { ResearchSignal, SignalSourceReference } from "../types";
import {
  confidenceFromCompleteness,
  linearScore,
  normalizeScore,
  pctChange,
  ratio,
  round
} from "../math";

const ACCELERATION_CURVE = [
  { input: 25, score: 25 },
  { input: 75, score: 55 },
  { input: 150, score: 80 },
  { input: 300, score: 95 }
] as const;

/**
 * Token-level acceleration detector. Returns one signal per qualifying
 * token, sorted by score descending.
 */
export function detectTokenActivityAcceleration(
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const currentTokens = current.kelucallsData?.trendingTokens ?? [];
  if (currentTokens.length === 0) return [];

  const baselineByToken = new Map<string, KelucallsTokenMetric>();
  for (const token of baseline?.kelucallsData?.trendingTokens ?? []) {
    baselineByToken.set(token.tokenId, token);
  }

  const sources: SignalSourceReference[] = ["kelucalls"];
  const signals: ResearchSignal[] = [];

  for (const token of currentTokens) {
    const previous = baselineByToken.get(token.tokenId);
    const previousCalls = previous?.totalCalls ?? 0;
    const previousChannels = previous?.uniqueChannels ?? 0;

    const callGrowthPct = pctChange(token.totalCalls, previousCalls);
    const channelGrowthPct = pctChange(token.uniqueChannels, previousChannels);

    if (callGrowthPct === null || channelGrowthPct === null) continue;

    const avgGrowth = (callGrowthPct + channelGrowthPct) / 2;

    // Skip noise: only emit when BOTH call and channel counts grew.
    if (callGrowthPct <= 0 || channelGrowthPct <= 0) continue;

    const score = linearScore(avgGrowth, ACCELERATION_CURVE);
    if (score <= 0) continue;

    const confidence = confidenceFromCompleteness(
      Math.min(token.totalCalls, token.uniqueChannels),
      Math.min(previousCalls, previousChannels),
      3
    );

    signals.push({
      signal_type: "TOKEN_ACTIVITY_ACCELERATION",
      direction: "up",
      score: normalizeScore(score),
      confidence,
      supporting_metrics: {
        token: token.symbol,
        token_id: token.tokenId,
        calls: token.totalCalls,
        previous_calls: previousCalls,
        channels: token.uniqueChannels,
        previous_channels: previousChannels,
        call_growth_pct: round(callGrowthPct, 1),
        channel_growth_pct: round(channelGrowthPct, 1),
        avg_growth_pct: round(avgGrowth, 1),
        call_ratio: round(ratio(token.totalCalls, previousCalls) ?? 0, 2),
        channel_ratio: round(ratio(token.uniqueChannels, previousChannels) ?? 0, 2),
        best_multiple: token.bestMultiple,
        last_called_at: token.lastCalledAt
      },
      timestamp: generatedAt,
      source_references: sources
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}
