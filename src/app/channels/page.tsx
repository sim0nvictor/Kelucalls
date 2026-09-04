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
import { formatMultiple } from "@/lib/metrics";
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
          minWidth="min-w-0 sm:min-w-[68rem]"
          tableClassName="table-fixed"
          className="self-start"
        >
          <DataTableHeader>
            <th scope="col" className="w-14 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 first:pl-4">
              Rank
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
              Channel
            </th>
            <th scope="col" className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              Verification
            </th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
              Calls
            </th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
              Win Rate
            </th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
              Avg ROI
            </th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              Avg Multiple
            </th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              Best Multiple
            </th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              2x
            </th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              10x
            </th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              100x
            </th>
            <th scope="col" className="hidden px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">
              PnL
            </th>
            <th scope="col" className="hidden px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 last:pr-4 sm:table-cell">
              Status
            </th>
          </DataTableHeader>
          <tbody>
            {channels.map((channel, index) => (
              <DataTableRow key={channel.id} interactive>
                <td className="px-3 py-3 text-left first:pl-4">
                  <span className={index < 3 ? "font-semibold text-yellow-300" : "font-semibold text-slate-400"}>
                    #{index + 1}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <ChannelIdentity
                    href={`/channels/${channel.slug}`}
                    title={channel.title}
                    avatarUrl={channel.avatarUrl}
                    description={channel.description}
                  />
                  <div className="mt-1 flex items-center gap-2 sm:hidden">
                    <a
                      href={channel.telegramUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      Telegram
                    </a>
                    <VerificationBadge verified={channel.isVerified} />
                  </div>
                  <details className="mt-2 sm:hidden">
                    <summary className="cursor-pointer text-xs text-cyan-300 marker:text-slate-600">
                      More metrics
                    </summary>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                      <div>
                        <dt className="text-slate-500">Avg multiple</dt>
                        <dd className="text-slate-300">{formatMultiple(channel.averageMultiple)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Best multiple</dt>
                        <dd className="text-slate-300">{formatMultiple(channel.bestMultiple)}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Milestones</dt>
                        <dd className="text-slate-300">
                          {channel.hit2xCount} / {channel.hit10xCount} / {channel.hit100xCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">PnL</dt>
                        <dd><PerformanceValue value={channel.simulatedCurrentPnlUsd} kind="currency" /></dd>
                      </div>
                      <div>
                        <dt className="text-slate-500">Status</dt>
                        <dd><StatusBadge status={channel.status} /></dd>
                      </div>
                    </dl>
                  </details>
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <VerificationBadge verified={channel.isVerified} />
                </td>
                <td className="px-3 py-3 text-right">
                  <MetricValue value={channel.totalCalls} />
                </td>
                <td className="px-3 py-3 text-right">
                  <PerformanceValue value={channel.winRatePct} />
                </td>
                <td className="px-3 py-3 text-right">
                  <PerformanceValue value={channel.averageRoiPct} />
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
