import { getTopOpportunities } from "@/lib/intent/queries";
import { jsonResponse, parseNumber } from "@/lib/intent/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_TOP_LIMIT = 10;

/**
 * GET /api/opportunities/top
 *
 * A trimmed leaderboard payload for widgets and embeds. Returns a flat, small
 * shape rather than the full intent object, so it stays cheap to poll.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseNumber(searchParams.get("limit")) ?? DEFAULT_TOP_LIMIT;

  const opportunities = await getTopOpportunities({ limit });

  const top = opportunities.map((opportunity, index) => ({
    rank: index + 1,
    tokenId: opportunity.token.id,
    symbol: opportunity.token.symbol,
    name: opportunity.token.name,
    chain: opportunity.token.chain,
    contractAddress: opportunity.token.contractAddress,
    keluScore: opportunity.intent.keluScore,
    grade: opportunity.intent.grade,
    growthScore: opportunity.intent.growthScore,
    calls24h: opportunity.intent.calls24h,
    uniqueChannels: opportunity.intent.uniqueChannels,
    computedAt: opportunity.intent.computedAt
  }));

  return jsonResponse({ count: top.length, top });
}
