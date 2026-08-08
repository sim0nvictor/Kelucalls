import { Info } from "lucide-react";

import { ScoreBadge } from "@/components/intent/score-badge";
import { ScoreBar } from "@/components/intent/score-bar";
import {
  ScoreHistoryChart,
  type TimelinePoint
} from "@/components/intent/score-history-chart";
import { GRADE_DESCRIPTIONS, type IntentSignal, type TokenIntent } from "@/lib/intent/types";

// Re-exported so existing importers of TimelinePoint keep working.
export type { TimelinePoint };

const TONE_STYLES: Record<IntentSignal["tone"], string> = {
  positive: "border-emerald-400/20 bg-emerald-400/5 text-emerald-200",
  neutral: "border-white/10 bg-white/5 text-slate-300",
  warning: "border-amber-400/20 bg-amber-400/5 text-amber-200"
};

/**
 * The Intent section shown on a token page.
 *
 * Purely presentational: it receives already-computed data and renders it.
 * Adding this to a page cannot slow that page down beyond the single query
 * that fetched the row. The one client component is the history chart, which
 * is deliberately isolated so the rest of this section stays server-rendered.
 */
export function IntentPanel({
  intent,
  symbol,
  history = []
}: {
  intent: TokenIntent | null;
  symbol: string;
  history?: TimelinePoint[];
}) {
  if (!intent) {
    return (
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 px-6 py-8 sm:px-8">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold text-white">Intent</h2>
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-300">
            KeluScore
          </span>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/8 bg-white/4 p-4 text-sm text-slate-400">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-500" />
          <p>
            No KeluScore has been calculated for {symbol} yet. Scores are produced by a
            background worker and appear once the token has been called recently enough
            to be picked up.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-[2rem] border border-white/10 bg-slate-950/75 px-6 py-8 sm:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold text-white">Intent</h2>
            <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-cyan-300">
              KeluScore
            </span>
          </div>
          <p className="max-w-md text-sm text-slate-400">{GRADE_DESCRIPTIONS[intent.grade]}</p>
        </div>

        <ScoreBadge score={intent.keluScore} grade={intent.grade} />
      </div>

      {/* Headline sub-scores */}
      <div className="grid gap-5 sm:grid-cols-3">
        <ScoreBar
          label="Growth"
          value={intent.growthScore}
          hint="Momentum combined with how widely it has spread"
          accent="emerald"
        />
        <ScoreBar
          label="Marketing"
          value={intent.marketingScore}
          hint="Website and social presence"
          accent="violet"
        />
        <ScoreBar
          label="Community"
          value={intent.communityScore}
          hint="Audience size"
          accent="violet"
        />
      </div>

      {/* Component breakdown */}
      <div className="space-y-4 rounded-2xl border border-white/8 bg-white/4 p-5">
        <h3 className="text-xs uppercase tracking-widest text-slate-500">How this score is built</h3>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <ScoreBar
            label="Conviction"
            value={intent.convictionScore}
            hint="Track record of the channels calling it"
          />
          <ScoreBar
            label="Momentum"
            value={intent.momentumScore}
            hint="Activity versus its own baseline"
          />
          <ScoreBar
            label="Breadth"
            value={intent.breadthScore}
            hint="Independent channels calling it"
          />
          <ScoreBar
            label="Performance"
            value={intent.performanceScore}
            hint="How previous calls actually did"
          />
          <ScoreBar
            label="Freshness"
            value={intent.freshnessScore}
            hint="Decays as calls get older"
          />
          <ScoreBar
            label="Liquidity"
            value={intent.liquidityScore}
            hint="Depth and 24h volume"
          />
        </div>
      </div>

      {/* Activity counters */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Calls 24h", value: String(intent.calls24h) },
          { label: "Calls 7d", value: String(intent.calls7d) },
          { label: "Calls 30d", value: String(intent.calls30d) },
          { label: "Channels", value: String(intent.uniqueChannels) }
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Signals */}
      {intent.signals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs uppercase tracking-widest text-slate-500">Signals</h3>
          <div className="space-y-2">
            {intent.signals.map((signal) => (
              <div
                key={signal.key}
                className={"rounded-2xl border px-4 py-3 " + TONE_STYLES[signal.tone]}
              >
                <div className="text-sm font-medium">{signal.label}</div>
                {signal.detail && (
                  <div className="mt-0.5 text-xs opacity-70">{signal.detail}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {intent.recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs uppercase tracking-widest text-slate-500">Recommendations</h3>
          <ul className="space-y-2">
            {intent.recommendations.map((recommendation) => (
              <li
                key={recommendation.key}
                className="flex gap-3 rounded-2xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300"
              >
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-cyan-400" />
                {recommendation.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScoreHistoryChart points={history} />

      <p className="text-[11px] text-slate-600">
        Last calculated{" "}
        {new Date(intent.computedAt).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short"
        })}
        . KeluScore is research tooling, not financial advice.
      </p>
    </section>
  );
}
