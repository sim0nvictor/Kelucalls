import { getTopOpportunities } from "@/lib/intent/queries";
import { jsonResponse, parseGrade, parseNumber } from "@/lib/intent/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/opportunities
 *
 * Query params:
 *   limit    - 1..100, defaults to 24
 *   minScore - only return tokens at or above this KeluScore
 *   grade    - A | B | C | D
 *
 * Reads precomputed rows only. This endpoint never triggers scoring.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = parseNumber(searchParams.get("limit"));
  const minScore = parseNumber(searchParams.get("minScore"));
  const grade = parseGrade(searchParams.get("grade"));

  const opportunities = await getTopOpportunities({ limit, minScore, grade });

  return jsonResponse({
    count: opportunities.length,
    filters: {
      limit: limit ?? 24,
      minScore: minScore ?? null,
      grade
    },
    opportunities
  });
}
