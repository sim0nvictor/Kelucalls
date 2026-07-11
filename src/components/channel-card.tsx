import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

import { formatCompactCurrency, formatMultiple, formatPercent } from "@/lib/metrics";
import type { ChannelSummary } from "@/types/kelucalls";
import type { Channel as LegacyChannel } from "@/types/channel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChannelAvatar } from "@/components/channel-avatar";

type ChannelCardProps = {
  channel: ChannelSummary | LegacyChannel;
  rank?: number;
};

function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-center rounded-xl border border-white/8 bg-white/4 px-2 py-2">
      <div className="truncate text-[9px] font-medium uppercase tracking-[0.12em] leading-none text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 truncate text-sm font-semibold leading-none text-white">
        {value}
      </div>
    </div>
  );
}

export function ChannelCard({ channel, rank }: ChannelCardProps) {
  if (!("slug" in channel)) {
    return (
      <Card className="h-full border-white/8 bg-slate-950/70 w-full">
        <CardContent className="flex h-full flex-col gap-5 p-4 sm:p-6">
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
    <Card className="h-full border-white/8 bg-slate-950/70 w-full">
      <CardContent className="flex h-full flex-col gap-2.5 p-3 sm:p-4">

        {/* ── Header ── */}
        <div className="flex items-start gap-2.5">
          {/* Avatar with rank badge overlaid */}
          <div className="relative shrink-0">
            <ChannelAvatar src={channel.avatarUrl} title={channel.title} size={40} />
            {rank ? (
              <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-0.5 text-[9px] font-bold text-slate-950 leading-none">
                #{rank}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-snug text-white">
              {channel.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <Badge className="border-white/10 bg-white/5 px-1.5 py-0 text-[9px] leading-4 text-slate-300 capitalize tracking-normal">
                {channel.status}
              </Badge>
              {channel.isVerified ? (
                <Badge className="border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0 text-[9px] leading-4 text-emerald-200 tracking-normal">
                  ✓ Verified
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-slate-400">
              {channel.description || "No channel profile has been written yet."}
            </p>
          </div>
        </div>

        {/* ── Stats rows ── */}
        <div className="grid grid-cols-3 gap-1.5">
          <StatPill
            label="Avg ROI"
            value={
              <span className={channel.averageRoiPct >= 0 ? "text-emerald-300" : "text-red-400"}>
                {formatPercent(channel.averageRoiPct)}
              </span>
            }
          />
          <StatPill label="Win Rate" value={formatPercent(channel.winRatePct)} />
          <StatPill
            label="Score"
            value={channel.rankingScore != null ? channel.rankingScore.toFixed(1) : "—"}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <StatPill
            label="Sim PnL"
            value={
              <span className={channel.simulatedCurrentPnlUsd >= 0 ? "text-emerald-300" : "text-red-400"}>
                {formatCompactCurrency(channel.simulatedCurrentPnlUsd)}
              </span>
            }
          />
          <StatPill label="Best ×" value={formatMultiple(channel.bestMultiple)} />
          <StatPill
            label="10x/100x"
            value={`${channel.hit10xCount}/${channel.hit100xCount}`}
          />
        </div>

        {/* ── Call count strip ── */}
        <div className="flex items-center rounded-lg border border-white/6 bg-white/3 px-2.5 py-1.5 text-xs">
          <span className="text-slate-500">Calls</span>
          <span className="ml-1.5 font-semibold text-white">{channel.totalCalls}</span>
        </div>

        {/* ── Action buttons — compact, side by side ── */}
        <div className="mt-auto flex gap-2">
          <a href={channel.telegramUrl} target="_blank" rel="noreferrer" className="flex-1">
            <Button className="h-8 w-full rounded-full px-3 text-xs">
              Telegram
            </Button>
          </a>
          <Link href={`/channels/${channel.slug}`} className="flex-1">
            <Button variant="secondary" className="h-8 w-full rounded-full px-3 text-xs">
              Report <ArrowUpRight className="size-3" />
            </Button>
          </Link>
        </div>

      </CardContent>
    </Card>
  );
}