/**
 * KeluScore (TM) scoring model.
 *
 * PURE FUNCTIONS ONLY. No I/O, no Supabase, no network, no clock reads. Every
 * function here is deterministic, which means the whole model can be reasoned
 * about and unit tested without a database.
 *
 * Why the model lives in the worker rather than in src/lib:
 *   The worker is plain JavaScript and the app is TypeScript. Rather than
 *   maintain the same maths in two languages, the worker is the ONLY place a
 *   score is ever calculated. The app reads finished rows from intent_scores.
 *   That also keeps page loads free of scoring work.
 *
 * Scoring philosophy:
 *   A sub-score returns null when the underlying data does not exist. Null is
 *   NOT zero. A token with no marketing data is unknown, not bad. The
 *   composite renormalises over whichever sub-scores are actually available,
 *   so adding a data source later raises accuracy without rescaling history.
 */

export const SCORE_VERSION = 1;

/**
 * Composite weights. These sum to 1.0 when every sub-score is present, but
 * composite() renormalises, so a missing input never silently drags a score
 * toward zero.
 */
export const WEIGHTS = {
  conviction: 0.28,
  momentum: 0.24,
  breadth: 0.16,
  performance: 0.16,
  freshness: 0.08,
  liquidity: 0.04,
  marketing: 0.02,
  community: 0.02
};

export const FRESHNESS_HALF_LIFE_HOURS = 48;

export function clamp(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round2(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Saturating curve. Returns 0 at 0, exactly 0.5 at halfPoint, and approaches
 * 1 without ever reaching it.
 *
 * Used everywhere instead of linear scaling so that a token with 400 calls
 * does not score 40x a token with 10. Crypto metrics are heavy tailed; linear
 * scaling would let one outlier flatten the entire leaderboard.
 */
export function saturate(value, halfPoint) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(halfPoint) || halfPoint <= 0) return 0;
  return value / (value + halfPoint);
}

/**
 * Conviction - how credible are the people calling this token.
 *
 * This is the sub-score no competitor can copy, because it depends on
 * Kelucalls having tracked every caller's historical win rate.
 *
 * A 70% win-rate channel calling alone is worth more than five unknown
 * channels, but breadth still matters, so quality is scaled by a confidence
 * factor that grows with the number of distinct callers.
 */
export function convictionScore({ averageWinRatePct = null, uniqueChannels = 0 }) {
  if (averageWinRatePct === null || !Number.isFinite(averageWinRatePct)) return 0;
  const quality = clamp(averageWinRatePct);
  const confidence = 0.5 + 0.5 * saturate(uniqueChannels, 2);
  return clamp(quality * confidence);
}

/**
 * Momentum - is call activity accelerating right now.
 *
 * Compares the last 24h against the token's own trailing baseline rather than
 * against other tokens. A token that normally gets one call a week suddenly
 * getting four in a day is a stronger signal than a constantly-called token
 * getting its usual five.
 */
export function momentumScore({ calls24h = 0, calls7d = 0, calls30d = 0 }) {
  const dailyFrom30d = calls30d > 0 ? calls30d / 30 : 0;
  const dailyFrom7d = calls7d > 0 ? calls7d / 7 : 0;
  const baseline = Math.max(dailyFrom30d, dailyFrom7d, 0.05);

  const ratio = calls24h / baseline;
  const burst = saturate(Math.max(ratio - 1, 0), 2);
  const absoluteVolume = saturate(calls24h, 3);

  return clamp(100 * (0.7 * burst + 0.3 * absoluteVolume));
}

/**
 * Breadth - how many independent channels are calling it.
 *
 * Separates organic spread from a single channel spamming the same token.
 */
export function breadthScore({ uniqueChannels = 0 }) {
  return clamp(100 * saturate(uniqueChannels, 4));
}

/**
 * Performance - what actually happened to previous calls on this token.
 */
export function performanceScore({ winRatePct = null, averagePeakMultiple = null }) {
  const hasWinRate = winRatePct !== null && Number.isFinite(winRatePct);
  const hasPeak = averagePeakMultiple !== null && Number.isFinite(averagePeakMultiple);
  if (!hasWinRate && !hasPeak) return 0;

  const winPart = hasWinRate ? clamp(winRatePct) : 0;
  const peakPart = hasPeak ? clamp(100 * saturate(averagePeakMultiple - 1, 2)) : 0;

  if (!hasPeak) return clamp(winPart);
  if (!hasWinRate) return clamp(peakPart);
  return clamp(0.6 * winPart + 0.4 * peakPart);
}

/**
 * Freshness - exponential decay since the most recent call.
 *
 * Half life of 48h: a token called two days ago scores 50, four days ago 25.
 * This is what stops the Opportunities board filling up with stale winners.
 */
export function freshnessScore({ hoursSinceLastCall = null }) {
  if (hoursSinceLastCall === null || !Number.isFinite(hoursSinceLastCall)) return 0;
  if (hoursSinceLastCall <= 0) return 100;
  return clamp(100 * Math.pow(0.5, hoursSinceLastCall / FRESHNESS_HALF_LIFE_HOURS));
}

/**
 * Liquidity - can you actually get in and out.
 *
 * Returns null when Dexscreener has not been collected for this token yet.
 */
export function liquidityScore({ liquidityUsd = null, volume24hUsd = null }) {
  const hasLiquidity = liquidityUsd !== null && Number.isFinite(liquidityUsd);
  const hasVolume = volume24hUsd !== null && Number.isFinite(volume24hUsd);
  if (!hasLiquidity && !hasVolume) return null;

  const parts = [];
  if (hasLiquidity) parts.push(saturate(liquidityUsd, 100000));
  if (hasVolume) parts.push(saturate(volume24hUsd, 250000));

  const average = parts.reduce((total, value) => total + value, 0) / parts.length;
  return clamp(100 * average);
}

/**
 * Marketing - presence and reach of official channels.
 *
 * Phase 1 derives this from what Dexscreener already exposes: whether the
 * project has a website and how many social links it publishes. That is a
 * presence signal, not an engagement signal, and it is deliberately weighted
 * low until real engagement data exists.
 *
 * Returns null when no external data has been collected.
 */
export function marketingScore({ hasWebsite = null, socialCount = null }) {
  const knowsWebsite = hasWebsite !== null;
  const knowsSocials = socialCount !== null && Number.isFinite(socialCount);
  if (!knowsWebsite && !knowsSocials) return null;

  const websitePart = hasWebsite === true ? 40 : 0;
  const socialPart = knowsSocials ? clamp(120 * saturate(socialCount, 2), 0, 60) : 0;

  return clamp(websitePart + socialPart);
}

/**
 * Community - audience size.
 *
 * Requires the X collector, which needs a paid API token. Returns null until
 * then, and the UI must render null as unavailable rather than as zero.
 */
export function communityScore({ twitterFollowers = null }) {
  if (twitterFollowers === null || !Number.isFinite(twitterFollowers)) return null;
  return clamp(100 * saturate(twitterFollowers, 20000));
}

export function gradeFor(score) {
  if (score >= 75) return "A";
  if (score >= 55) return "B";
  if (score >= 35) return "C";
  return "D";
}

/**
 * Weighted composite that renormalises over available sub-scores.
 */
export function composite(subScores) {
  let weighted = 0;
  let totalWeight = 0;

  for (const key of Object.keys(WEIGHTS)) {
    const value = subScores[key];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    weighted += value * WEIGHTS[key];
    totalWeight += WEIGHTS[key];
  }

  if (totalWeight <= 0) return 0;
  return clamp(weighted / totalWeight);
}

/**
 * Human readable observations for the Intent tab.
 *
 * tone is one of positive, neutral, warning - the UI maps these to colour.
 */
export function buildSignals(input, scores) {
  const signals = [];

  if (input.calls24h > 0) {
    signals.push({
      key: "calls_24h",
      tone: input.calls24h >= 3 ? "positive" : "neutral",
      label: input.calls24h === 1 ? "1 call in the last 24h" : input.calls24h + " calls in the last 24h",
      detail: "Measured against this token's own trailing average, not other tokens."
    });
  }

  if (input.uniqueChannels >= 3) {
    signals.push({
      key: "breadth",
      tone: "positive",
      label: input.uniqueChannels + " independent channels have called this",
      detail: "Multiple unrelated callers is harder to manufacture than volume from one channel."
    });
  } else if (input.uniqueChannels === 1) {
    signals.push({
      key: "single_caller",
      tone: "warning",
      label: "Only one channel has called this",
      detail: "Single-source calls carry more risk of coordinated promotion."
    });
  }

  if (scores.conviction >= 60) {
    signals.push({
      key: "caller_quality",
      tone: "positive",
      label: "Called by historically accurate channels",
      detail: "Average caller win rate of " + round2(input.averageWinRatePct || 0) + " percent."
    });
  } else if (input.averageWinRatePct !== null && input.averageWinRatePct < 35) {
    signals.push({
      key: "weak_callers",
      tone: "warning",
      label: "Callers have a weak track record",
      detail: "Average caller win rate of " + round2(input.averageWinRatePct) + " percent."
    });
  }

  if (scores.freshness < 25 && input.hoursSinceLastCall !== null) {
    signals.push({
      key: "stale",
      tone: "warning",
      label: "Call activity has gone quiet",
      detail: "Last call was around " + Math.round(input.hoursSinceLastCall) + " hours ago."
    });
  }

  if (scores.liquidity !== null && scores.liquidity < 20) {
    signals.push({
      key: "thin_liquidity",
      tone: "warning",
      label: "Thin liquidity",
      detail: "Exiting a position may move the price significantly."
    });
  }

  if (scores.marketing === null && scores.community === null) {
    signals.push({
      key: "no_external_data",
      tone: "neutral",
      label: "No external project data collected yet",
      detail: "Marketing and community scores are unavailable, not zero."
    });
  }

  return signals;
}

export function buildRecommendations(input, scores) {
  const recommendations = [];

  if (scores.momentum >= 60 && scores.conviction >= 55) {
    recommendations.push({
      key: "watch_closely",
      text: "Accelerating call activity from credible channels. Worth watching closely."
    });
  }

  if (scores.breadth < 30 && input.calls30d > 0) {
    recommendations.push({
      key: "verify_independently",
      text: "Coverage is concentrated in very few channels. Verify independently before acting."
    });
  }

  if (scores.liquidity !== null && scores.liquidity < 20) {
    recommendations.push({
      key: "size_down",
      text: "Liquidity is thin. Position size should account for slippage on exit."
    });
  }

  if (scores.freshness < 25) {
    recommendations.push({
      key: "aging",
      text: "This opportunity is ageing. The score will keep decaying without new calls."
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      key: "insufficient",
      text: "Not enough signal yet to draw a strong conclusion."
    });
  }

  return recommendations;
}

/**
 * Main entry point. Takes raw metrics, returns everything needed to upsert a
 * row into intent_scores.
 */
export function computeKeluScore(input) {
  const normalised = {
    calls24h: input.calls24h || 0,
    calls7d: input.calls7d || 0,
    calls30d: input.calls30d || 0,
    uniqueChannels: input.uniqueChannels || 0,
    averageWinRatePct: input.averageWinRatePct === undefined ? null : input.averageWinRatePct,
    winRatePct: input.winRatePct === undefined ? null : input.winRatePct,
    averagePeakMultiple: input.averagePeakMultiple === undefined ? null : input.averagePeakMultiple,
    hoursSinceLastCall: input.hoursSinceLastCall === undefined ? null : input.hoursSinceLastCall,
    liquidityUsd: input.liquidityUsd === undefined ? null : input.liquidityUsd,
    volume24hUsd: input.volume24hUsd === undefined ? null : input.volume24hUsd,
    hasWebsite: input.hasWebsite === undefined ? null : input.hasWebsite,
    socialCount: input.socialCount === undefined ? null : input.socialCount,
    twitterFollowers: input.twitterFollowers === undefined ? null : input.twitterFollowers
  };

  const scores = {
    conviction: round2(convictionScore(normalised)),
    momentum: round2(momentumScore(normalised)),
    breadth: round2(breadthScore(normalised)),
    performance: round2(performanceScore(normalised)),
    freshness: round2(freshnessScore(normalised)),
    liquidity: null,
    marketing: null,
    community: null
  };

  const rawLiquidity = liquidityScore(normalised);
  const rawMarketing = marketingScore(normalised);
  const rawCommunity = communityScore(normalised);

  scores.liquidity = rawLiquidity === null ? null : round2(rawLiquidity);
  scores.marketing = rawMarketing === null ? null : round2(rawMarketing);
  scores.community = rawCommunity === null ? null : round2(rawCommunity);

  const keluScore = round2(composite(scores));

  return {
    version: SCORE_VERSION,
    keluScore,
    grade: gradeFor(keluScore),
    scores,
    signals: buildSignals(normalised, scores),
    recommendations: buildRecommendations(normalised, scores),
    inputs: normalised
  };
}
