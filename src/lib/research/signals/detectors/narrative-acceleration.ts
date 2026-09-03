/**
 * Detector: NARRATIVE_ACCELERATION
 *
 * A "narrative" is a story that the data is telling — e.g. "AI tokens
 * are trending" or "DeFi is back". We treat a narrative as a category
 * or entity that suddenly shows up across multiple independent sources
 * (news + Kelucalls) faster than the prior baseline.
 *
 * Inputs
 * ------
 *   - current.kelucallsData.trendingTokens (top N symbols)
 *   - current.newsData.items (entities extracted per item)
 *   - baseline (same shape, prior cycle) for delta computation
 *
 * Logic
 * -----
 * 1. Build the set of "asset" entities currently mentioned in news
 *    (entity.type === "asset") and the set of symbols in the current
 *    Kelucalls trending list. Their intersection is the "narrative
 *    candidates" set.
 * 2. For each candidate, count:
 *    - news mentions in current cycle
 *    - kelucalls trending presence (1 if in trending list, else 0)
 * 3. If a candidate appears in BOTH the current news and current
 *    trending list with a meaningfully higher combined footprint than
 *    in the baseline (>= 2x growth OR absolute mention count >= 3),
 *    emit a NARRATIVE_ACCELERATION signal.
 *
 * Score is the ratio of current mentions to baseline mentions mapped
 * through a curve. Confidence is high when both news AND kelucalls
 * independently show the asset; medium when only one does.
 */

import type {
  DailyResearchSnapshot,
  ResearchItem
} from "../../types";
import type { ResearchSignal, SignalSourceReference } from "../types";
import {
  confidenceFromCompleteness,
  linearScore,
  normalizeScore,
  round
} from "../math";

const NARRATIVE_CURVE = [
  { input: 2, score: 40 },
  { input: 4, score: 65 },
  { input: 7, score: 85 },
  { input: 12, score: 95 }
] as const;

const MIN_NEWS_MENTIONS = 2;
const MIN_TRENDING_PRESENCE = 1;
const MIN_GROWTH_RATIO = 1.5;

const NARRATIVE_ALIASES: Record<string, string[]> = {
  BTC: ["BTC", "BITCOIN"],
  ETH: ["ETH", "ETHEREUM"],
  SOL: ["SOL", "SOLANA"],
  USDT: ["USDT", "TETHER"],
  USDC: ["USDC"],
  BNB: ["BNB"],
  XRP: ["XRP"],
  DOGE: ["DOGE"],
  ADA: ["ADA", "CARDANO"]
};

function aliasesFor(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  return NARRATIVE_ALIASES[upper] ?? [upper];
}

function symbolMatches(symbol: string, entityValue: string): boolean {
  const aliases = aliasesFor(symbol);
  const target = entityValue.toUpperCase();
  return aliases.includes(target);
}

function countNewsMentions(items: ResearchItem[], symbol: string): number {
  let count = 0;
  for (const item of items) {
    for (const entity of item.entities) {
      if (entity.type === "asset" && symbolMatches(symbol, entity.value)) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

export function detectNarrativeAcceleration(
  current: DailyResearchSnapshot,
  baseline: DailyResearchSnapshot | null,
  generatedAt: string
): ResearchSignal[] {
  const currentNews = current.newsData?.items ?? [];
  const currentTrending = current.kelucallsData?.trendingTokens ?? [];
  if (currentNews.length === 0 || currentTrending.length === 0) return [];

  const baselineNews = baseline?.newsData?.items ?? [];
  const baselineTrendingSymbols = new Set(
    (baseline?.kelucallsData?.trendingTokens ?? []).map((token) => token.symbol.toUpperCase())
  );

  const sources: SignalSourceReference[] = ["news", "kelucalls"];
  const signals: ResearchSignal[] = [];

  for (const token of currentTrending) {
    const symbol = token.symbol.toUpperCase();
    if (!symbol) continue;

    const currentNewsCount = countNewsMentions(currentNews, symbol);
    const baselineNewsCount = countNewsMentions(baselineNews, symbol);
    const inTrendingNow = 1;
    const inTrendingBefore = baselineTrendingSymbols.has(symbol) ? 1 : 0;

    if (currentNewsCount < MIN_NEWS_MENTIONS) continue;
    if (inTrendingNow < MIN_TRENDING_PRESENCE) continue;

    // Combined "narrative footprint": news mentions + trending presence.
    // We add 1 to each so the ratio handles 0/0 cleanly.
    const currentFootprint = currentNewsCount + inTrendingNow;
    const baselineFootprint = baselineNewsCount + inTrendingBefore;
    if (currentFootprint <= baselineFootprint) continue;

    const ratio = currentFootprint / Math.max(baselineFootprint, 1);
    if (ratio < MIN_GROWTH_RATIO) continue;

    const score = linearScore(ratio, NARRATIVE_CURVE);
    if (score <= 0) continue;

    const confidence = confidenceFromCompleteness(
      Math.max(currentNewsCount, inTrendingNow),
      Math.max(baselineNewsCount, inTrendingBefore),
      2
    );

    signals.push({
      signal_type: "NARRATIVE_ACCELERATION",
      direction: "up",
      score: normalizeScore(score),
      confidence,
      supporting_metrics: {
        token: symbol,
        token_id: token.tokenId,
        current_news_mentions: currentNewsCount,
        baseline_news_mentions: baselineNewsCount,
        current_in_trending: inTrendingNow,
        baseline_in_trending: inTrendingBefore,
        current_footprint: currentFootprint,
        baseline_footprint: baselineFootprint,
        growth_ratio: round(ratio, 2),
        current_calls: token.totalCalls,
        current_unique_channels: token.uniqueChannels
      },
      timestamp: generatedAt,
      source_references: sources
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}
