import { NextResponse } from "next/server";

import { getDashboardSnapshot } from "@/lib/dashboard-data";
import type { RankingMode } from "@/types/kelucalls";

const rankingModes: RankingMode[] = ["smart", "roi", "win-rate", "pnl"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedMode = searchParams.get("ranking");
  const rankingMode = rankingModes.includes(requestedMode as RankingMode)
    ? (requestedMode as RankingMode)
    : "smart";

  const snapshot = await getDashboardSnapshot(rankingMode);
  return NextResponse.json(snapshot);
}
