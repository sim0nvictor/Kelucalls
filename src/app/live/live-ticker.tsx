"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LiveCall } from "@/types/kelucalls";
import { formatPercent, formatMultiple } from "@/lib/metrics";
import { TokenAvatar } from "@/components/token-avatar";

interface LiveFeedTickerProps {
  calls: LiveCall[];
}

export function LiveFeedTicker({ calls: initialCalls }: LiveFeedTickerProps) {
  const displayCalls = initialCalls.slice(0, 8);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-slate-950/70">
      <div className="flex animate-scroll gap-6 whitespace-nowrap py-4 px-4">
        {[...displayCalls, ...displayCalls].map((call, index) => (
          <Link
            key={`${call.id}-${index}`}
            href={`/channels/${call.channelSlug}`}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 transition-all hover:border-cyan-400/30 hover:bg-white/10 shrink-0"
          >
            <TokenAvatar
              src={call.tokenLogoUrl}
              symbol={call.tokenSymbol}
              size={28}
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-white">{call.tokenSymbol}</span>
                {call.currentRoiPct > 0 ? (
                  <TrendingUp className="size-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="size-3 text-red-400" />
                )}
              </div>
              <div className="text-xs text-slate-500">{call.channelTitle}</div>
            </div>
            <div className={`text-sm font-bold ${call.currentRoiPct > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {formatPercent(call.currentRoiPct)}
            </div>
            <div className="text-sm text-slate-400">{formatMultiple(call.peakMultiple)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}