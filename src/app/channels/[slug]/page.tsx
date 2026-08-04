import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { JsonLd } from "@/components/json-ld";
import { getChannelDetail } from "@/lib/dashboard-data";
import {
  breadcrumbSchema,
  channelDatasetSchema,
  graph,
  SITE_URL,
} from "@/lib/schema";

export const revalidate = 900; // 15 minutes

type ChannelPageProps = {
  params: Promise<{ slug: string }>;
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export async function generateMetadata({
  params,
}: ChannelPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getChannelDetail(slug);

  if (!detail) {
    return { title: "Channel not found", robots: { index: false, follow: true } };
  }

  const channel = detail.summary;
  const canonical = `${SITE_URL}/channels/${channel.slug}`;
  const title = `${channel.title} \u2014 Telegram call performance`;
  const description = `${channel.title} has ${channel.totalCalls} tracked calls with a ${channel.winRatePct.toFixed(1)}% win rate and ${channel.averageRoiPct.toFixed(1)}% average ROI. Best multiple: ${channel.bestMultiple.toFixed(2)}x.`;

  // Channels with almost no history are real pages but thin content. Keep them
  // crawlable and linked, but out of the index until they have a track record.
  const isThin = channel.totalCalls < 5;

  return {
    title,
    description,
    alternates: { canonical },
    robots: isThin ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: { title, description, url: canonical, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ChannelDetailPage({ params }: ChannelPageProps) {
  const { slug } = await params;
  const detail = await getChannelDetail(slug);

  if (!detail) notFound();

  const { summary: channel, recentCalls } = detail;

  const stats = [
    { label: "Tracked calls", value: channel.totalCalls.toLocaleString() },
    { label: "Win rate", value: `${channel.winRatePct.toFixed(1)}%` },
    { label: "Average ROI", value: pct(channel.averageRoiPct) },
    { label: "Best multiple", value: `${channel.bestMultiple.toFixed(2)}x` },
    { label: "Simulated PnL", value: usd.format(channel.simulatedCurrentPnlUsd) },
    { label: "2x / 10x / 100x", value: `${channel.hit2xCount} / ${channel.hit10xCount} / ${channel.hit100xCount}` },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <JsonLd
        schema={graph(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Channels", path: "/channels" },
            { name: channel.title, path: `/channels/${channel.slug}` },
          ]),
          channelDatasetSchema(channel)
        )}
      />

      {/* Visible breadcrumb trail — matches the BreadcrumbList above */}
      <nav aria-label="Breadcrumb" className="text-sm text-slate-400">
        <Link href="/" className="hover:text-cyan-400">
          Home
        </Link>
        <span className="px-2 text-slate-600">/</span>
        <Link href="/channels" className="hover:text-cyan-400">
          Channels
        </Link>
        <span className="px-2 text-slate-600">/</span>
        <span className="text-slate-300">{channel.title}</span>
      </nav>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Tracked channel</Badge>
          {channel.isVerified && (
            <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
              Verified
            </Badge>
          )}
          {channel.isPaidChannel && (
            <Badge className="border-amber-400/20 bg-amber-400/10 text-amber-200">
              Paid channel
            </Badge>
          )}
        </div>

        <h1 className="mt-4 text-4xl font-semibold text-white">
          {channel.title}
        </h1>

        <p className="mt-3 max-w-3xl text-base leading-8 text-slate-300">
          {channel.description?.trim()
            ? channel.description
            : `${channel.title} is a Telegram channel tracked by Kelucalls. Every call below was recorded from the channel's own message timestamps, then priced against on-chain data to produce the ROI, win rate, and simulated PnL figures shown here. No figures are self-reported by the channel.`}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={channel.telegramUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/15 px-4 py-2 text-sm text-cyan-100"
          >
            Open {channel.telegramHandle} on Telegram
          </a>
          <Link
            href="/ranking-methodology"
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300"
          >
            How this score is calculated
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold text-white">Recent calls</h2>

        {recentCalls.length === 0 ? (
          <p className="text-sm leading-7 text-slate-400">
            No calls have been recorded for this channel yet. Once it posts a
            call, it will appear here automatically.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Token</th>
                  <th className="px-4 py-3">Called</th>
                  <th className="px-4 py-3">Current ROI</th>
                  <th className="px-4 py-3">Peak multiple</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call) => (
                  <tr key={call.id} className="border-t border-white/5">
                    <td className="px-4 py-3 font-medium text-white">
                      {call.contractAddress ? (
                        <Link
                          href={`/tokens/${encodeURIComponent(call.contractAddress)}`}
                          className="hover:text-cyan-400"
                        >
                          {call.tokenSymbol}
                        </Link>
                      ) : (
                        call.tokenSymbol
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      <time dateTime={call.calledAt}>
                        {new Date(call.calledAt).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    </td>
                    <td
                      className={`px-4 py-3 ${call.currentRoiPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {pct(call.currentRoiPct)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {call.peakMultiple.toFixed(2)}x
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {channel.refreshedAt && (
          <p className="text-xs text-slate-500">
            Stats last refreshed{" "}
            <time dateTime={channel.refreshedAt}>
              {new Date(channel.refreshedAt).toLocaleString("en-US")}
            </time>
            .
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
        <h2 className="text-lg font-semibold text-white">
          This is performance data, not financial advice
        </h2>
        <p className="mt-2 text-sm leading-7 text-slate-400">
          Past call performance does not predict future results. Simulated PnL
          assumes a fixed hypothetical position size per call with no slippage,
          fees, or partial exits, so real-world returns would differ. Read our{" "}
          <Link href="/disclaimer" className="text-cyan-400 hover:underline">
            full disclaimer
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
