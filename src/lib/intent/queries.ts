/**
 * Read-only data access for KeluScore.
 *
 * Every function here READS precomputed rows written by
 * workers/intent-engine.js. Nothing in this file calculates a score. See
 * src/lib/intent/types.ts for why.
 *
 * Uses the existing withSupabase() helper, which returns the supplied fallback
 * instead of throwing when Supabase is unconfigured or a query fails. That
 * means a missing intent_scores table degrades the Opportunities page to an
 * empty state rather than a 500 - important while the migration has not been
 * run yet.
 */

import { withSupabase } from "@/lib/supabase";
import {
  mapIntentScore,
  type IntentGrade,
  type IntentScoreRow,
  type TokenIntent
} from "@/lib/intent/types";

export interface OpportunityToken {
  id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contractAddress: string | null;
}

export interface Opportunity {
  token: OpportunityToken;
  intent: TokenIntent;
}

export interface IntentHistoryPoint {
  keluScore: number;
  grade: IntentGrade | null;
  capturedAt: string;
}

export interface ScoreChange {
  delta: number;
  direction: "up" | "down";
  previousScore: number | null;
  currentScore: number;
  createdAt: string;
}

const SCORE_FIELDS = [
  "token_id",
  "kelu_score",
  "grade",
  "conviction_score",
  "momentum_score",
  "breadth_score",
  "performance_score",
  "freshness_score",
  "marketing_score",
  "community_score",
  "liquidity_score",
  "calls_24h",
  "calls_7d",
  "calls_30d",
  "unique_channels",
  "signals",
  "recommendations",
  "inputs",
  "computed_at"
].join(", ");

// !inner drops score rows whose token was deleted, so the UI never renders a
// card with no token behind it.
const TOKEN_EMBED = "tokens!inner ( id, symbol, name, chain, contract_address )";

type RawTokenEmbed = {
  id: string;
  symbol: string;
  name: string | null;
  chain: string;
  contract_address: string | null;
};

type RawOpportunityRow = IntentScoreRow & {
  tokens: RawTokenEmbed | RawTokenEmbed[] | null;
};

/**
 * PostgREST returns an embedded relation as either an object or a one-element
 * array depending on how it infers cardinality. Normalise both.
 */
function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toOpportunity(row: RawOpportunityRow): Opportunity | null {
  const token = firstRelation(row.tokens);
  if (!token) return null;

  return {
    token: {
      id: String(token.id),
      symbol: String(token.symbol),
      name: token.name ? String(token.name) : null,
      chain: String(token.chain),
      contractAddress: token.contract_address ? String(token.contract_address) : null
    },
    intent: mapIntentScore(row)
  };
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

/**
 * The Opportunities leaderboard. Backed by the intent_scores_leaderboard_idx
 * index, so this stays fast as the table grows.
 */
export async function getTopOpportunities(
  options: {
    limit?: number;
    minScore?: number;
    grade?: IntentGrade | null;
  } = {}
): Promise<Opportunity[]> {
  const limit = clampLimit(options.limit, 24, 100);

  return withSupabase<Opportunity[]>(async (supabase) => {
    let query = supabase
      .from("intent_scores")
      .select(SCORE_FIELDS + ", " + TOKEN_EMBED)
      .order("kelu_score", { ascending: false })
      .limit(limit);

    if (typeof options.minScore === "number" && Number.isFinite(options.minScore)) {
      query = query.gte("kelu_score", options.minScore);
    }

    if (options.grade) {
      query = query.eq("grade", options.grade);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawOpportunityRow[];
    return rows
      .map(toOpportunity)
      .filter((entry): entry is Opportunity => entry !== null);
  }, []);
}

/** Intent data for one token, by token id. */
export async function getTokenIntent(tokenId: string): Promise<TokenIntent | null> {
  if (!tokenId) return null;

  return withSupabase<TokenIntent | null>(async (supabase) => {
    const { data, error } = await supabase
      .from("intent_scores")
      .select(SCORE_FIELDS)
      .eq("token_id", tokenId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return mapIntentScore(data as unknown as IntentScoreRow);
  }, null);
}

/**
 * Intent data by contract address, for the public API route.
 *
 * Uses ilike to match the token page's lookup, since addresses are
 * case-insensitive on EVM chains and stored with mixed casing.
 */
export async function getTokenIntentByAddress(
  address: string
): Promise<Opportunity | null> {
  if (!address) return null;

  return withSupabase<Opportunity | null>(async (supabase) => {
    const { data: token, error: tokenError } = await supabase
      .from("tokens")
      .select("id, symbol, name, chain, contract_address")
      .ilike("contract_address", address)
      .maybeSingle();

    if (tokenError) throw tokenError;
    if (!token) return null;

    const { data, error } = await supabase
      .from("intent_scores")
      .select(SCORE_FIELDS)
      .eq("token_id", token.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      token: {
        id: String(token.id),
        symbol: String(token.symbol),
        name: token.name ? String(token.name) : null,
        chain: String(token.chain),
        contractAddress: token.contract_address ? String(token.contract_address) : null
      },
      intent: mapIntentScore(data as unknown as IntentScoreRow)
    };
  }, null);
}

/** Score history for the Timeline. Returned oldest first for charting. */
export async function getIntentHistory(
  tokenId: string,
  limit = 60
): Promise<IntentHistoryPoint[]> {
  if (!tokenId) return [];
  const safeLimit = clampLimit(limit, 60, 365);

  return withSupabase<IntentHistoryPoint[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("intent_history")
      .select("kelu_score, grade, captured_at")
      .eq("token_id", tokenId)
      .order("captured_at", { ascending: false })
      .limit(safeLimit);

    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      kelu_score: number;
      grade: IntentGrade | null;
      captured_at: string;
    }>;

    return rows
      .map((row) => ({
        keluScore: Number(row.kelu_score),
        grade: row.grade,
        capturedAt: row.captured_at
      }))
      .reverse();
  }, []);
}

/** Recent material score moves for one token. */
export async function getScoreChanges(
  tokenId: string,
  limit = 5
): Promise<ScoreChange[]> {
  if (!tokenId) return [];
  const safeLimit = clampLimit(limit, 5, 50);

  return withSupabase<ScoreChange[]>(async (supabase) => {
    const { data, error } = await supabase
      .from("score_changes")
      .select("delta, direction, previous_score, current_score, created_at")
      .eq("token_id", tokenId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);

    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
      delta: number;
      direction: "up" | "down";
      previous_score: number | null;
      current_score: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      delta: Number(row.delta),
      direction: row.direction,
      previousScore: row.previous_score === null ? null : Number(row.previous_score),
      currentScore: Number(row.current_score),
      createdAt: row.created_at
    }));
  }, []);
}
