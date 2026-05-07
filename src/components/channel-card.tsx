import Link from "next/link";
import { ArrowUpRight, BadgeCheck, DollarSign, Percent, Trophy } from "lucide-react";

import { formatCompactCurrency, formatMultiple, formatPercent } from "@/lib/metrics";
import type { ChannelSummary } from "@/types/kelucalls";
import type { Channel as LegacyChannel } from "@/types/channel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ChannelCardProps = {
  channel: ChannelSummary | LegacyChannel;
  rank?: number;
};

export function ChannelCard({ channel, rank }: ChannelCardProps) {
  if (!("slug" in channel)) {
    return (
      <Card className="h-full border-white/8 bg-slate-950/70">
        <CardContent className="flex h-full flex-col gap-5">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge>{channel.category}</Badge>
              {channel.verified ? (
                <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                  Verified
                </Badge>
              ) : null}
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">{channel.name}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{channel.tagline}</p>
          </div>
          <p className="text-sm leading-7 text-slate-400">{channel.description}</p>
          <div className="mt-auto flex gap-3">
            <a href={channel.telegramUrl} target="_blank" rel="noreferrer" className="flex-1">
              <Button className="w-full">Open Telegram</Button>
            </a>
            <Link href={`/channel/${channel.id}`} className="flex-1">
              <Button variant="secondary" className="w-full">
                View Details
                <ArrowUpRight className="size-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full border-white/8 bg-slate-950/70">
      <CardContent className="flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {rank ? <Badge>Rank #{rank}</Badge> : null}
              {channel.isVerified ? (
                <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                  Verified
                </Badge>
              ) : null}
              <Badge className="border-white/10 bg-white/5 text-slate-200">{channel.status}</Badge>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">{channel.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {channel.description || "No channel profile has been written yet."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Percent className="size-4" />
              Average ROI
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {formatPercent(channel.averageRoiPct)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <BadgeCheck className="size-4" />
              Win Rate
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {formatPercent(channel.winRatePct)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <DollarSign className="size-4" />
              Simulated PnL
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {formatCompactCurrency(channel.simulatedCurrentPnlUsd)}
            </div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500">
              <Trophy className="size-4" />
              10x / 100x
            </div>
            <div className="mt-3 text-2xl font-semibold text-white">
              {channel.hit10xCount} / {channel.hit100xCount}
            </div>
          </div>
        </div>

        <div className="grid gap-3 text-sm text-slate-400 sm:grid-cols-3">
          <div>
            <div>Total calls</div>
            <div className="mt-1 text-lg font-semibold text-white">{channel.totalCalls}</div>
          </div>
          <div>
            <div>Best multiple</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatMultiple(channel.bestMultiple)}
            </div>
          </div>
          <div>
            <div>Ranking score</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {channel.rankingScore.toFixed(1)}
            </div>
          </div>
        </div>

        <div className="mt-auto flex gap-3">
          <a href={channel.telegramUrl} target="_blank" rel="noreferrer" className="flex-1">
            <Button className="w-full">Open Telegram</Button>
          </a>
          <Link href={`/channel/${channel.slug}`} className="flex-1">
            <Button variant="secondary" className="w-full">
              Channel Report
              <ArrowUpRight className="size-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
