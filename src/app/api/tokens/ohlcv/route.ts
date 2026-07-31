import { NextResponse, type NextRequest } from "next/server";

import {
  getTokenOhlcv,
  parseTimeframe,
  type OhlcvFailureReason,
} from "@/lib/tokens/ohlcv";

export const runtime = "nodejs";

/**
 * Internal price-history endpoint.
 *
 * GET /api/tokens/ohlcv?chain=solana&address=<contract>&timeframe=24H
 *
 * The client never talks to the upstream provider directly, and upstream
 * error payloads are never forwarded.
 */

const STATUS_BY_REASON: Record<OhlcvFailureReason, number> = {
  unsupported_chain: 400,
  invalid_address: 400,
  invalid_timeframe: 400,
  no_pools: 404,
  no_data: 404,
  rate_limited: 503,
  upstream_error: 502,
};

function errorResponse(reason: string, message: string, status: number) {
  return NextResponse.json({ error: { reason, message } }, { status });
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const chain = params.get("chain")?.trim() ?? "";
  const address = params.get("address")?.trim() ?? "";
  const timeframeParam = params.get("timeframe");

  if (!chain) {
    return errorResponse("invalid_request", "A chain is required.", 400);
  }

  if (!address) {
    return errorResponse("invalid_address", "A token contract address is required.", 400);
  }

  const timeframe = parseTimeframe(timeframeParam);
  if (!timeframe) {
    return errorResponse("invalid_timeframe", "Unsupported timeframe.", 400);
  }

  try {
    const result = await getTokenOhlcv({ chain, contractAddress: address, timeframe });

    if (!result.ok) {
      return errorResponse(
        result.reason,
        result.message,
        STATUS_BY_REASON[result.reason] ?? 500
      );
    }

    return NextResponse.json(
      {
        chain,
        network: result.network,
        address,
        timeframe: result.timeframe,
        poolAddress: result.poolAddress,
        source: result.source,
        candles: result.candles,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch {
    return errorResponse(
      "unexpected_error",
      "Unable to load price history right now.",
      500
    );
  }
}
