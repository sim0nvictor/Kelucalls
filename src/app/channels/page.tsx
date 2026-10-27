import Link from "next/link";

import { SubmissionForm } from "@/components/submission-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChannelIdentity,
  DataTable,
  DataTableHeader,
  DataTableRow,
  MetricValue,
  PerformanceValue,
  StatusBadge,
  VerificationBadge,
} from "@/components/ui/data-table";
import { getLeaderboard } from "@/lib/dashboard-data";
import { formatCompactPercent, formatMultiple, formatNumber } from "@/lib/metrics";
import type { RankingMode } from "@/types/kelucalls";

type ChannelsPageProps = {
  searchParams: Promise<{ ranking?: string }>;
};

const rankingModes: RankingMode[] = ["smart", "roi", "win-rate", "pnl"];

export default async function ChannelsPage({ searchParams }: ChannelsPageProps) {
  const { ranking } = await searchParams;
  const rankingMode = rankingModes.includes(ranking as RankingMode)
    ? (ranking as RankingMode)
    : "smart";
  const channels = await getLeaderboard(rankingMode);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-8">
        <Badge>All tracked channels</Badge>
        <h1 className="mt-4 text-4xl font-semibold text-white">Reputation table for tracked Telegram callers</h1>
        <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">
          This surface is strictly performance-ranked. Paid placements never affect position. Use the
          ranking toggle to compare smart score, raw ROI, win rate, and simulated PnL.
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
        <DataTable
          caption="Tracked channel rankings"
          minWidth="min-w-[460px] sm:min-w-[68rem]"
          tableClassName="table-fixed"
          columns={[
            { className: "w-[42px] sm:w-16" },
            { className: "w-[160px] sm:w-56" },
            { className: "hidden sm:table-column" },
            { className: "w-[64px] sm:w-auto" },
            { className: "w-[75px] sm:w-auto" },
            { className: "w-[105px] sm:w-auto" },
            { className: "hidden sm:table-column" },
            { className: "hidden sm:table-column" },
            { className: "hidden sm:table-column" },
            { className: "hidden sm:table-column" },
            { className: "hidden sm:table-column" },
            { className: "hidden sm:table-column" },
            { className: "hidden sm:table-column" },
          ]}
          className="self-start -mx-4 w-[calc(100%+2rem)] rounded-none border-x-0 border-y border-white/[0.08] bg-slate-950/20 sm:mx-0 sm:w-full sm:rounded-lg sm:border"
        >
          <DataTableHeader className="bg-slate-950/95 backdrop-blur">
            <th scope="col" className="sticky left-0 z-50 whitespace-nowrap border-b border-white/10 bg-slate-950/95 px-1.5 py-3 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-left sm:text-xs">
              Rank
            </th>
            <th scope="col" className="sticky left-[42px] z-40 whitespace-nowrap border-b border-white/10 bg-slate-950/95 px-1.5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:left-16 sm:px-3 sm:text-xs">
              Channel
            </th>
            <th scope="col" className="sticky z-30 hidden whitespace-nowrap border-b border-white/10 bg-slate-950/95 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              Verification
            </th>
            <th scope="col" className="sticky z-30 whitespace-nowrap border-b border-white/10 bg-slate-950/95 px-1 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-xs">
              Calls
            </th>
            <th scope="col" className="sticky z-30 whitespace-nowrap border-b border-white/10 bg-slate-950/95 px-1 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-xs">
              Win %
            </th>
            <th scope="col" className="sticky z-30 whitespace-nowrap border-b border-white/10 bg-slate-950/95 px-1.5 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:px-3 sm:text-xs">
              Avg ROI
            </th>
            <th scope="col" className="sticky z-30 hidden border-b border-white/10 bg-slate-950/95 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              Avg Multiple
            </th>
            <th scope="col" className="sticky z-30 hidden border-b border-white/10 bg-slate-950/95 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              Best Multiple
            </th>
            <th scope="col" className="sticky z-30 hidden border-b border-white/10 bg-slate-950/95 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              2x
            </th>
            <th scope="col" className="sticky z-30 hidden border-b border-white/10 bg-slate-950/95 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              10x
            </th>
            <th scope="col" className="sticky z-30 hidden border-b border-white/10 bg-slate-950/95 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              100x
            </th>
            <th scope="col" className="sticky z-30 hidden border-b border-white/10 bg-slate-950/95 px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              PnL
            </th>
            <th scope="col" className="sticky z-30 hidden border-b border-white/10 bg-slate-950/95 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 last:pr-4 sm:table-cell">
              Status
            </th>
          </DataTableHeader>
          <tbody>
            {channels.map((channel, index) => (
              <DataTableRow key={channel.id} interactive className="group">
                <td className="sticky left-0 z-10 bg-[#06101f] px-1.5 py-2 text-center group-hover:bg-[#0b1c2a] sm:px-3 sm:text-left">
                  <span className={`font-semibold tabular-nums ${index < 3 ? ["text-amber-300", "text-slate-200", "text-orange-300"][index] : "text-slate-400"}`}>
                    #{index + 1}
                  </span>
                </td>
                <td className="sticky left-[42px] z-10 bg-[#06101f] px-1.5 py-2 group-hover:bg-[#0b1c2a] sm:left-16 sm:px-3">
                  <ChannelIdentity
                    href={`/channels/${channel.slug}`}
                    title={
                      channel.title.trim() && channel.title.trim().toLowerCase() !== "telegram"
                        ? channel.title
                        : channel.telegramHandle.replace(/^@/, "") || "Unknown channel"
                    }
                    avatarUrl={channel.avatarUrl}
                    description={`Telegram · ${formatNumber(channel.totalCalls)} calls`}
                    className="min-h-11 gap-2"
                  />
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <VerificationBadge verified={channel.isVerified} />
                </td>
                <td className="px-1 py-2 text-right sm:px-3 sm:py-3">
                  <MetricValue value={formatNumber(channel.totalCalls)} className="text-xs sm:text-sm" />
                </td>
                <td className="px-1 py-2 text-right sm:px-3 sm:py-3">
                  <PerformanceValue value={channel.winRatePct} className="text-xs sm:text-sm" />
                </td>
                <td className="px-1.5 py-2 text-right sm:px-3 sm:py-3">
                  <span className={`whitespace-nowrap font-mono text-xs tabular-nums sm:text-sm ${channel.averageRoiPct > 0 ? "text-emerald-300" : channel.averageRoiPct < 0 ? "text-red-300" : "text-slate-300"}`}>
                    {formatCompactPercent(channel.averageRoiPct)}
                  </span>
                </td>
                <td className="hidden px-3 py-3 text-right text-slate-300 sm:table-cell">
                  {formatMultiple(channel.averageMultiple)}
                </td>
                <td className="hidden px-3 py-3 text-right text-slate-300 sm:table-cell">
                  {formatMultiple(channel.bestMultiple)}
                </td>
                <td className="hidden px-3 py-3 text-right text-slate-300 sm:table-cell">{channel.hit2xCount}</td>
                <td className="hidden px-3 py-3 text-right text-slate-300 sm:table-cell">{channel.hit10xCount}</td>
                <td className="hidden px-3 py-3 text-right text-slate-300 sm:table-cell">{channel.hit100xCount}</td>
                <td className="hidden px-3 py-3 text-right sm:table-cell">
                  <PerformanceValue value={channel.simulatedCurrentPnlUsd} kind="currency" />
                </td>
                <td className="hidden px-3 py-3 text-left last:pr-4 sm:table-cell">
                  <StatusBadge status={channel.status} />
                </td>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>

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
