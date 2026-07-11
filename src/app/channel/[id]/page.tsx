import Link from "next/link";

import { SubmissionForm } from "@/components/submission-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getLeaderboard, getSponsoredPlacements } from "@/lib/dashboard-data";
import { LeaderboardWithPlacements } from "@/components/leaderboard-with-placements";
import type { RankingMode } from "@/types/kelucalls";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type ChannelsPageProps = {
  searchParams: Promise<{ ranking?: string }>;
};

const rankingModes: RankingMode[] = ["smart", "roi", "win-rate", "pnl"];

export default async function ChannelsPage({ searchParams }: ChannelsPageProps) {
  const { ranking } = await searchParams;
  const rankingMode = rankingModes.includes(ranking as RankingMode)
    ? (ranking as RankingMode)
    : "smart";

  const [channels, sponsoredPlacements] = await Promise.all([
    getLeaderboard(rankingMode, 24),
    getSponsoredPlacements(3),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-8">
        <Badge>All tracked channels</Badge>
        <h1 className="mt-4 text-4xl font-semibold text-white">Reputation table for tracked Telegram callers</h1>
        <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">
          This surface is strictly performance-ranked. Sponsored placements appear below the top
          ranks, clearly labeled, and never affect position. Use the ranking toggle to compare
          smart score, raw ROI, win rate, and simulated PnL.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {rankingModes.map((mode) => (
            <Link key={mode} href={`/channels?ranking=${mode}`}>
              <span
                className={`inline-flex rounded-full border px-4 py-2 text-sm ${
                  rankingMode === mode
                    ? "border-cyan-400/30 bg-cyan-400/15 text-cyan-100"
                    : "border-white/10 bg-white/5 text-slate-300"
                }`}
              >
                {mode}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div>
          {/* Sponsored placements inject after rank 5/6, same logic as homepage */}
          <LeaderboardWithPlacements channels={channels} placements={sponsoredPlacements} />
        </div>

        <Card id="submissions" className="h-fit">
          <CardContent className="space-y-4">
            <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
              Submit a channel
            </Badge>
            <div>
              <h2 className="text-2xl font-semibold text-white">Public intake, admin approval</h2>
              <p className="mt-2 text-sm leading-7 text-slate-400">
                Submissions enter a pending queue. Admins can approve, reject, or fast-track them
                without requiring user login.
              </p>
            </div>
            <SubmissionForm />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}