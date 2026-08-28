/**
 * Detector: CROSS_SOURCE_CONFIRMATION
 *
 * Aggregate detector: the same direction of activity shows up across
 * multiple independent sources. The strongest signals are when Kelucalls
 * call activity, DeFi TVL, and Fear & Greed all move in the same
 * direction at the same time.
 *
 * Inputs
 * ------
 *   - current.kelucallsData.callVelocity / uniqueTokensLast24h
 *   - current.defiData.totalTvl.change24hPct
 *   - current.sentimentData.current.value (Fear & Greed today)
 *   - baseline.sentimentData.previousDay.value (Fear & Greed yesterday)
 *
 * Logic
 * -----
 * Each source contributes a signed "directional vote" in {-1, 0, +1}
 * based on its current value vs its prior value. The detector sums the
 * votes, then emits a CROSS_SOURCE_CONFIRMATION signal when:
 *   - At least 2 sources have a non-zero vote
 *   - The sum of the votes has magnitude >= 2 (i.e. aligned votes)
 *
 * Score is the magnitude of the summed vote. Confidence is high when
 * all three sources vote, medium when only two vote.
 *
 * The signal carries a "direction" of "confirmation" because that's
 * exactly what the engine is detecting: independent sources confirming
 * the same direction of activity.
 */

import type { DailyResearchSnapshot } from "../../types";
import type { ResearchSignal, SignalSourceReference } from "../types";
import {
  confidenceFromCompleteness,
  linearScore,
  normalizeScore,
  round
} from "../math";

const CONFIRMATION_CURVE = [
  { input: 2, score: 45 },
  { input: 2.5, score: 70 },
  { input: 2.9, score: 90 }
] as const;

const MIN_VOTES = 2;

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type Vote = -1 | 0 | 1;

function sign(value: number | null): Vote {
  if (value === null) return 0;
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function detectCrossSourceConfirmation(
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const votes: Array<{ source: SignalSourceReference; vote: Vote; raw: number | null }> = [];

  // Kelucalls: call velocity (current - previous). Positive => more
  // activity, negative => less activity. We treat a velocity of zero
  // as "no signal" rather than "down" because zero is a natural rest
  // state for the dataset.
  const callVelocity = safeNumber(current.kelucallsData?.callVelocity);
  const baselineCallVelocity = (() => {
    if (!baseline?.kelucallsData) return null;
    const last = safeNumber(baseline.kelucallsData.callsLast24h);
    const previous = safeNumber(baseline.kelucallsData.callsPrevious24h);
    if (last === null || previous === null) return null;
    return last - previous;
  })();

  if (callVelocity !== null && baselineCallVelocity !== null) {
    const delta = callVelocity - baselineCallVelocity;
    votes.push({ source: "kelucalls", vote: sign(delta), raw: delta });
  }

  // DeFiLlama: 24h TVL change vs the baseline's 24h TVL change. If
  // the change is accelerating (i.e. moving in the same direction by a
  // larger amount), that's a confirmation.
  const currentTvlChange = safeNumber(current.defiData?.totalTvl?.change24hPct);
  const baselineTvlChange = safeNumber(baseline?.defiData?.totalTvl?.change24hPct);
  if (currentTvlChange !== null && baselineTvlChange !== null) {
    const delta = currentTvlChange - baselineTvlChange;
    votes.push({ source: "defillama", vote: sign(delta), raw: delta });
  }

  // Fear & Greed: today's value vs yesterday's value.
  const fngToday = safeNumber(current.sentimentData?.current?.value);
  const fngYesterday = safeNumber(current.sentimentData?.previousDay?.value);
  if (fngToday !== null && fngYesterday !== null) {
    votes.push({ source: "fear_greed", vote: sign(fngToday - fngYesterday), raw: fngToday - fngYesterday });
  }

  const nonZeroVotes = votes.filter((entry) => entry.vote !== 0);
  if (nonZeroVotes.length < MIN_VOTES) return [];

  const aligned = nonZeroVotes.every((entry) => entry.vote === nonZeroVotes[0].vote);
  if (!aligned) return [];

  const sumOfVotes = nonZeroVotes.reduce((sum, entry) => sum + entry.vote, 0);
  const score = linearScore(Math.abs(sumOfVotes), CONFIRMATION_CURVE);
  if (score <= 0) return [];

  const confidence = confidenceFromCompleteness(
    nonZeroVotes.length,
    nonZeroVotes.length,
    2
  );

  return [
    {
      signal_type: "CROSS_SOURCE_CONFIRMATION",
      direction: "confirmation",
      score: normalizeScore(score),
      confidence,
      supporting_metrics: {
        aligned_sources: nonZeroVotes.length,
        direction: sumOfVotes > 0 ? "up" : "down",
        sum_of_votes: sumOfVotes,
        kelucalls_velocity_delta: votes.find((entry) => entry.source === "kelucalls")?.raw ?? null,
        defillama_tvl_delta: votes.find((entry) => entry.source === "defillama")?.raw ?? null,
        fear_greed_delta: votes.find((entry) => entry.source === "fear_greed")?.raw ?? null,
        kelucalls_velocity: round(callVelocity ?? 0, 1),
        defillama_tvl_change_24h_pct: currentTvlChange,
        defillama_baseline_tvl_change_24h_pct: baselineTvlChange,
        fear_greed_today: fngToday,
        fear_greed_yesterday: fngYesterday
      },
      timestamp: generatedAt,
      source_references: nonZeroVotes.map((entry) => entry.source)
    }
  ];
}
