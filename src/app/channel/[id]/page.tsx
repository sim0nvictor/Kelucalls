import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getChannelDetail, getLeaderboard } from "@/lib/dashboard-data";
import { formatCompactCurrency, formatMultiple, formatPercent } from "@/lib/metrics";

type ChannelReportPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateStaticParams() {
  const channels = await getLeaderboard("smart", 50);
  return channels.map((channel) => ({ id: channel.slug }));
}

export default async function ChannelReportPage({ params }: ChannelReportPageProps) {
  const { id } = await params;
  const detail = await getChannelDetail(id);

  if (!detail) {
    notFound();
  }

  const { summary, recentCalls } = detail;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Channel report</Badge>
          {summary.isVerified ? (
            <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
              Verified
            </Badge>
          ) : null}
        </div>
        <h1 className="mt-4 text-4xl font-semibold text-white">{summary.title}</h1>
        <p className="mt-3 max-w-4xl text-base leading-8 text-slate-300">
          {summary.description || "This channel has no editorial profile yet."}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Average ROI" value={formatPercent(summary.averageRoiPct)} />
          <StatCard label="Win rate" value={formatPercent(summary.winRatePct)} />
          <StatCard label="Simulated PnL" value={formatCompactCurrency(summary.simulatedCurrentPnlUsd)} />
          <StatCard label="Best multiple" value={formatMultiple(summary.bestMultiple)} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">Recent tracked calls</h2>
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <div key={call.id} className="rounded-2xl border border-white/8 bg-slate-900/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-white">{call.tokenSymbol}</div>
                      <div className="mt-1 text-sm text-slate-500">{new Date(call.calledAt).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-500">Current ROI</div>
                      <div className="mt-1 text-xl font-semibold text-white">
                        {formatPercent(call.currentRoiPct)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-400">
                    <span>Entry ${call.entryPriceUsd.toFixed(8)}</span>
                    <span>Peak {formatMultiple(call.peakMultiple)}</span>
                    {call.hit2x ? <span>2x</span> : null}
                    {call.hit10x ? <span>10x</span> : null}
                    {call.hit100x ? <span>100x</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">Channel profile</h2>
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
              <div className="text-slate-500">Telegram handle</div>
              <div className="mt-2 font-semibold text-white">@{summary.telegramHandle}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
              <div className="text-slate-500">Total tracked calls</div>
              <div className="mt-2 font-semibold text-white">{summary.totalCalls}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-slate-300">
              <div className="text-slate-500">2x / 10x / 100x</div>
              <div className="mt-2 font-semibold text-white">
                {summary.hit2xCount} / {summary.hit10xCount} / {summary.hit100xCount}
              </div>
            </div>
            <a
              href={summary.telegramUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-100"
            >
              Open channel
            </a>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/8 bg-white/4 p-5">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
