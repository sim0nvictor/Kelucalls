import Link from "next/link";
import { Radio, Layers } from "lucide-react";

import { ChainIcon } from "@/components/chain-icon";
import { chainLabel } from "@/lib/chains";
import { GradePill } from "@/components/intent/score-badge";
import { formatScore } from "@/lib/intent/types";
import type { Opportunity } from "@/lib/intent/queries";

/** Compact sub-score readout used inside the card. */
function MiniScore({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/8">
        {value !== null && (
          <div
            className="h-full rounded-full bg-cyan-400/80"
            style={{ width: Math.max(0, Math.min(100, value)) + "%" }}
          />
        )}
      </div>
      <div className="text-[11px] font-medium text-slate-400">{formatScore(value)}</div>
    </div>
  );
}

export function OpportunityCard({
  opportunity,
  rank
}: {
  opportunity: Opportunity;
  rank?: number;
}) {
  const { token, intent } = opportunity;

  const href = token.contractAddress
    ? "/tokens/" + encodeURIComponent(token.contractAddress)
    : "/tokens";

  return (
    <Link
      href={href}
      className="group flex flex-col gap-4 rounded-2xl border border-white/8 bg-slate-900/70 p-5 transition-all hover:border-cyan-400/30 hover:bg-slate-900"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {rank !== undefined && (
              <span className="text-xs font-semibold text-slate-600">#{rank}</span>
            )}
            <span className="truncate text-lg font-semibold text-white group-hover:text-cyan-300">
              {token.symbol}
            </span>
            <GradePill grade={intent.grade} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ChainIcon chain={token.chain} size={14} />
            {chainLabel(token.chain)}
            {token.name && <span className="truncate"> · {token.name}</span>}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-3xl font-semibold tracking-tight text-white">
            {Math.round(intent.keluScore)}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">KeluScore</div>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="grid grid-cols-3 gap-3">
        <MiniScore label="Growth" value={intent.growthScore} />
        <MiniScore label="Conviction" value={intent.convictionScore} />
        <MiniScore label="Momentum" value={intent.momentumScore} />
      </div>

      {/* Footer counters */}
      <div className="flex items-center gap-4 border-t border-white/5 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <Radio className="size-3.5" />
          {intent.calls24h} in 24h
        </span>
        <span className="flex items-center gap-1.5">
          <Layers className="size-3.5" />
          {intent.uniqueChannels} channels
        </span>
      </div>
    </Link>
  );
}
