/**
 * Deterministic math helpers used by every signal detector.
 *
 * All functions are pure. No Date.now(), no I/O, no random IDs. They are
 * the ONLY math the engine uses to derive scores, confidence, and growth
 * metrics; an LLM never sees these numbers.
 */

import type { SignalConfidence } from "./types";

/**
 * Percentage change between `now` and `then`. Returns null when the
 * divisor is non-finite, zero, or negative — the engine treats any of
 * those conditions as "the growth metric is undefined" and the calling
 * detector decides whether to drop the signal or substitute a fallback.
 */
export function pctChange(now: number, then: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return null;
  return ((now - then) / then) * 100;
}

/**
 * Ratio between `now` and `then`. Returns null when the divisor is
 * non-finite or zero. Used for "1.0x" growth comparisons.
 */
export function ratio(now: number, then: number): number | null {
  if (!Number.isFinite(now) || !Number.isFinite(then) || then === 0) return null;
  return now / then;
}

/**
 * Map a numeric value to a 0-100 score using a piece-wise linear curve.
 *
 * `points` must be sorted ascending by `input` and contain 2-4 entries.
 * Values below `points[0].input` clamp to `points[0].score`; values
 * above the last input clamp to its score; values in between interpolate
 * linearly between the surrounding points. The same shape is used by
 * every detector so the engine produces comparable numbers.
 */
export function linearScore(
  value: number,
  points: ReadonlyArray<{ input: number; score: number }>
): number {
  if (points.length < 2) return 0;
  if (!Number.isFinite(value)) return 0;

  const sorted = [...points].sort((a, b) => a.input - b.input);

  if (value <= sorted[0].input) return clamp(sorted[0].score, 0, 100);
  const last = sorted[sorted.length - 1];
  if (value >= last.input) return clamp(last.score, 0, 100);

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (value >= a.input && value <= b.input) {
      const span = b.input - a.input;
      const ratio = span === 0 ? 0 : (value - a.input) / span;
      return clamp(a.score + (b.score - a.score) * ratio, 0, 100);
    }
  }

  return clamp(last.score, 0, 100);
}

/**
 * Confidence level for a signal based on data completeness.
 *
 *   - high:     all required inputs present and above the size floor
 *   - medium:   primary input present, secondary input missing OR
 *               primary input is below the size floor
 *   - low:      only a single input is available and it is small
 *
 * The function takes the primary and secondary numeric inputs the
 * detector actually used plus a minimum size floor for the primary
 * input. The floor prevents a +500% "growth" reading on a dataset of
 * size 1 from claiming high confidence.
 */
export function confidenceFromCompleteness(
  primary: number | null,
  secondary: number | null,
  primaryFloor: number = 5
): SignalConfidence {
  if (primary === null) return "low";
  const primaryOk = Number.isFinite(primary) && Math.abs(primary) >= primaryFloor;
  if (primaryOk && secondary !== null && Number.isFinite(secondary)) return "high";
  if (primaryOk) return "medium";
  return "low";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Round a number to a fixed number of decimal places. Used so the
 * `supporting_metrics` payload stays compact and stable across runs.
 */
export function round(value: number, decimals: number = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Round and clamp a 0-100 score. Centralizes the rounding policy so
 * every detector emits two-decimal-place scores.
 */
export function normalizeScore(value: number): number {
  return round(clamp(value, 0, 100), 2);
}
