import { getIntentHistory, getTokenIntentByAddress } from "@/lib/intent/queries";
import { jsonResponse, parseNumber } from "@/lib/intent/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/tokens/[address]/intent
 *
 * Keyed on contract address to match the existing token route shape
 * (src/app/tokens/[address]), rather than on an internal uuid.
 *
 * Pass includeHistory=true to also receive the score timeline.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  const { address } = await context.params;
  const decoded = decodeURIComponent(address ?? "");

  if (!decoded) {
    return jsonResponse({ error: "Missing token address" }, 400);
  }

  const result = await getTokenIntentByAddress(decoded);

  if (!result) {
    return jsonResponse(
      { error: "No KeluScore found for this token", address: decoded },
      404
    );
  }

  const { searchParams } = new URL(request.url);
  const includeHistory = searchParams.get("includeHistory") === "true";
  const historyLimit = parseNumber(searchParams.get("historyLimit"));

  const history = includeHistory
    ? await getIntentHistory(result.token.id, historyLimit ?? 60)
    : undefined;

  return jsonResponse({
    token: result.token,
    intent: result.intent,
    history
  });
}
