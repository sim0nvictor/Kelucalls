/**
 * Detector: CALL_VELOCITY_ANOMALY
 *
 * Aggregate detector: call volume has spiked (or collapsed) far outside
 * its normal range, suggesting an unusual burst of activity.
 *
 * Inputs
 * ------
 *   - current.kelucallsData.{callsLast24h, callsPrevious24h,
 *     callVelocity, activeChannels}
 *   - baseline.kelucallsData.{callsLast24h, callsPrevious24h}
 *
 * Logic
 * -----
 * We compute the current period's call velocity (callsLast24h -
 * callsPrevious24h) and compare it to the baseline period's call
 * velocity. If the current velocity is more than 2x the baseline
 * velocity AND positive, the dataset is anomalously busy. If it is less
 * than half (and negative), the dataset is anomalously quiet.
 *
 * The score is the velocity ratio mapped through a curve that rewards
 * bigger swings. Confidence is high when both the current and baseline
 * periods have enough calls to be statistically meaningful.
 *
 * The signal is intentionally distinct from TOKEN_ACTIVITY_ACCELERATION:
 * that detector is per-token and concerns a single asset, while this
 * one captures the overall tempo of the dataset.
 */

import type { DailyResearchSnapshot } from "../../types";
import type { ResearchSignal, SignalSourceReference } from "../types";
import {
  confidenceFromCompleteness,
  linearScore,
  normalizeScore,
  round
} from "../math";

const SURGE_CURVE = [
  { input: 2, score: 35 },
  { input: 3, score: 60 },
  { input: 5, score: 80 },
  { input: 8, score: 95 }
] as const;

const DROP_CURVE = [
  { input: 0.5, score: 35 },
  { input: 0.25, score: 60 },
  { input: 0.1, score: 80 },
  { input: 0.02, score: 95 }
] as const;

const SURGE_THRESHOLD = 2;
const DROP_THRESHOLD = 0.5;
const SIZE_FLOOR = 10;

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function detectCallVelocityAnomaly(
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const currentData = current.kelucallsData;
  if (!currentData) return [];

  const currentCalls = safeNumber(currentData.callsLast24h);
  const previousCalls = safeNumber(currentData.callsPrevious24h);
  const currentVelocity = safeNumber(currentData.callVelocity);
  if (currentCalls === null || previousCalls === null || currentVelocity === null) return [];

  const baselineData = baseline?.kelucallsData;
  const baselineCurrentCalls = safeNumber(baselineData?.callsLast24h);
  const baselinePreviousCalls = safeNumber(baselineData?.callsPrevious24h);

  let baselineVelocity: number | null = null;
  if (baselineCurrentCalls !== null && baselinePreviousCalls !== null) {
    baselineVelocity = baselineCurrentCalls - baselinePreviousCalls;
  }

  if (currentVelocity <= 0 && baselineVelocity !== null && baselineVelocity <= 0) {
    return [];
  }

  // Velocity ratio: current_velocity / baseline_velocity.
  // We treat baselineVelocity === 0 carefully: a positive current velocity
  // on top of a zero baseline is a guaranteed anomaly, scored at the top
  // of the surge curve. A negative current velocity on a zero baseline is
  // a soft drop, scored at the bottom of the drop curve.
  let ratio: number;
  let synthetic: "synthetic_surge" | "synthetic_drop" | null = null;
  if (baselineVelocity === null || baselineVelocity === 0) {
    if (currentVelocity > 0) {
      ratio = SURGE_THRESHOLD + 1;
      synthetic = "synthetic_surge";
    } else if (currentVelocity < 0) {
      ratio = DROP_THRESHOLD - 0.01;
      synthetic = "synthetic_drop";
    } else {
      return [];
    }
  } else {
    if (baselineVelocity === 0) return [];
    ratio = currentVelocity / Math.abs(baselineVelocity);
    if (currentVelocity >= 0 && ratio < SURGE_THRESHOLD) return [];
    if (currentVelocity < 0 && ratio > DROP_THRESHOLD) return [];
  }

  const surge = currentVelocity > 0;
  const score = surge
    ? linearScore(ratio, SURGE_CURVE)
    : linearScore(ratio, DROP_CURVE);

  const confidence = confidenceFromCompleteness(currentCalls, baselineCurrentCalls, SIZE_FLOOR);

  return [
    {
      signal_type: "CALL_VELOCITY_ANOMALY",
      direction: surge ? "up" : "down",
      score: normalizeScore(score),
      confidence,
      supporting_metrics: {
        calls_last_24h: currentCalls,
        calls_previous_24h: previousCalls,
        current_velocity: currentVelocity,
        baseline_velocity: baselineVelocity,
        velocity_ratio: round(ratio, 2),
        active_channels: currentData.activeChannels,
        synthetic: synthetic
      },
      timestamp: generatedAt,
      source_references: ["kelucalls" satisfies SignalSourceReference]
    }
  ];
}
