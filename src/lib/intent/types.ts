/**
 * KeluScore (TM) - shared types for the Crypto Intent Engine.
 *
 * IMPORTANT ARCHITECTURAL RULE
 * ---------------------------
 * Nothing in the app ever CALCULATES a KeluScore. The scoring model lives in
 * workers/intent-scoring.js and runs in the background worker. The app only
 * ever READS precomputed rows out of intent_scores.
 *
 * That is deliberate:
 *   - the maths exists in exactly one place, so it cannot drift
 *   - page loads never pay for scoring work
 *   - the model can be reworked without touching a single component
 *
 * If you find yourself importing a scoring function into a component, stop.
 * Add the value to the worker output and the intent_scores table instead.
 */

export type IntentGrade = "A" | "B" | "C" | "D";

export type SignalTone = "positive" | "neutral" | "warning";

/** A human readable observation shown on the Intent tab. */
export interface IntentSignal {
  key: string;
  tone: SignalTone;
  label: string;
  detail?: string;
}

/** A suggested next action shown on the Intent tab. */
export interface IntentRecommendation {
  key: string;
  text: string;
}

/**
 * The raw metric values a score was derived from. Persisted so any score can
 * always be explained back to the user rather than being a black box.
 */
export interface IntentScoreInputs {
  calls24h?: number;
  calls7d?: number;
  calls30d?: number;
  uniqueChannels?: number;
  averageWinRatePct?: number | null;
  winRatePct?: number | null;
  averagePeakMultiple?: number | null;
  hoursSinceLastCall?: number | null;
  liquidityUsd?: number | null;
  volume24hUsd?: number | null;
  hasWebsite?: boolean | null;
  socialCount?: number | null;
  twitterFollowers?: number | null;
  version?: number;
}

/**
 * Row shape of public.intent_scores, exactly as stored.
 *
 * numeric columns come back from PostgREST as numbers, but nullable sub-scores
 * really can be null and that is meaningful: null means NOT ENOUGH DATA, not
 * zero. Never coalesce these to 0 for display.
 */
export interface IntentScoreRow {
  token_id: string;
  kelu_score: number;
  grade: IntentGrade;
  conviction_score: number;
  momentum_score: number;
  breadth_score: number;
  performance_score: number;
  freshness_score: number;
  marketing_score: number | null;
  community_score: number | null;
  liquidity_score: number | null;
  calls_24h: number;
  calls_7d: number;
  calls_30d: number;
  unique_channels: number;
  signals: IntentSignal[];
  recommendations: IntentRecommendation[];
  inputs: IntentScoreInputs;
  computed_at: string;
  created_at: string;
  updated_at: string;
}

/** Row shape of public.intent_history - drives the Timeline chart. */
export interface IntentHistoryRow {
  id: string;
  token_id: string;
  kelu_score: number;
  grade: IntentGrade | null;
  conviction_score: number | null;
  momentum_score: number | null;
  breadth_score: number | null;
  performance_score: number | null;
  freshness_score: number | null;
  marketing_score: number | null;
  community_score: number | null;
  liquidity_score: number | null;
  calls_24h: number | null;
  unique_channels: number | null;
  captured_at: string;
}

/** Row shape of public.score_changes - feeds Phase 3 alerts. */
export interface ScoreChangeRow {
  id: string;
  token_id: string;
  previous_score: number | null;
  current_score: number;
  delta: number;
  direction: "up" | "down";
  previous_grade: IntentGrade | null;
  current_grade: IntentGrade | null;
  reason: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

/**
 * Camel-cased, app-facing view of a token's intent data.
 *
 * Components should depend on this, not on the raw row, so a column rename in
 * the future is a one-line change in mapIntentScore().
 */
export interface TokenIntent {
  tokenId: string;
  keluScore: number;
  grade: IntentGrade;

  /**
   * The spec asks the Intent tab to show a "Growth Score". That is not stored
   * as its own column because it is fully derived: growth is how fast a token
   * is spreading, which is momentum (acceleration) combined with breadth
   * (how many independent channels). Deriving it keeps one source of truth.
   */
  growthScore: number;

  convictionScore: number;
  momentumScore: number;
  breadthScore: number;
  performanceScore: number;
  freshnessScore: number;

  /** null means unavailable. Render as a dash, never as 0. */
  marketingScore: number | null;
  communityScore: number | null;
  liquidityScore: number | null;

  calls24h: number;
  calls7d: number;
  calls30d: number;
  uniqueChannels: number;

  signals: IntentSignal[];
  recommendations: IntentRecommendation[];
  inputs: IntentScoreInputs;
  computedAt: string;
}

const GROWTH_MOMENTUM_WEIGHT = 0.6;
const GROWTH_BREADTH_WEIGHT = 0.4;

/** Derives the displayed Growth Score from stored sub-scores. */
export function deriveGrowthScore(momentum: number, breadth: number): number {
  const value = momentum * GROWTH_MOMENTUM_WEIGHT + breadth * GROWTH_BREADTH_WEIGHT;
  return Math.round(value * 100) / 100;
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/** Maps a raw intent_scores row into the app-facing shape. */
export function mapIntentScore(row: IntentScoreRow): TokenIntent {
  const momentum = toNumber(row.momentum_score);
  const breadth = toNumber(row.breadth_score);

  return {
    tokenId: row.token_id,
    keluScore: toNumber(row.kelu_score),
    grade: row.grade ?? "D",
    growthScore: deriveGrowthScore(momentum, breadth),
    convictionScore: toNumber(row.conviction_score),
    momentumScore: momentum,
    breadthScore: breadth,
    performanceScore: toNumber(row.performance_score),
    freshnessScore: toNumber(row.freshness_score),
    marketingScore: toNullableNumber(row.marketing_score),
    communityScore: toNullableNumber(row.community_score),
    liquidityScore: toNullableNumber(row.liquidity_score),
    calls24h: toNumber(row.calls_24h),
    calls7d: toNumber(row.calls_7d),
    calls30d: toNumber(row.calls_30d),
    uniqueChannels: toNumber(row.unique_channels),
    signals: toArray<IntentSignal>(row.signals),
    recommendations: toArray<IntentRecommendation>(row.recommendations),
    inputs: (row.inputs ?? {}) as IntentScoreInputs,
    computedAt: row.computed_at
  };
}

/** Formats a possibly-null sub-score for display. */
export function formatScore(value: number | null): string {
  if (value === null) return "--";
  return String(Math.round(value));
}

export const GRADE_DESCRIPTIONS: Record<IntentGrade, string> = {
  A: "Strong intent. Credible callers, accelerating activity.",
  B: "Solid intent. Worth a closer look.",
  C: "Mixed intent. Weak or narrow signal.",
  D: "Low intent. Little supporting evidence."
};
