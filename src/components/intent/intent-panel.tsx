import { TrendingUp, TrendingDown, Minus, Info } from "lucide-react";

import { ScoreBadge } from "@/components/intent/score-badge";
import { ScoreBar } from "@/components/intent/score-bar";
import { GRADE_DESCRIPTIONS, type IntentSignal, type TokenIntent } from "@/lib/intent/types";

/**
 * Structurally compatible with IntentHistoryPoint from lib/intent/queries,
 * declared locally so this presentational component never imports server code.
 */
export type TimelinePoint = {
  keluScore: number;
  capturedAt: string;
};

const TONE_STYLES: Record<IntentSignal["tone"], string> = {
  positive: "border-emerald-400/20 bg-emerald-400/5 text-emerald-200",
  neutral: "border-white/10 bg-white/5 text-slate-300",
  warning: "border-amber-400/20 bg-amber-400/5 text-amber-200"
};

/**
 * Score timeline as an inline SVG polyline.
 *
 * Deliberately not recharts: this is a static server-rendered sparkline, so it
 * ships zero client JavaScript and cannot slow the token page down. The richer
 * interactive chart is Phase 3.
 *
 * The Y axis is pinned to 0-100 rather than auto-scaled, so a token drifting
 * between 41 and 43 looks flat instead of looking like a rollercoaster.
 */
function ScoreTimeline({ points }: { points: TimelinePoint[] }) {
  if (points.length < 2) return null;

  const width = 600;
  const height = 64;
  const step = width / (points.length - 1);

  const coords = points.map((point, index) => {
    const x = index * step;
    const clamped = Math.max(0, Math.min(100, point.keluScore));
    const y = height - (clamped / 100) * height;
    return x.toFixed(1) + "," + y.toFixed(1);
  });

  const line = coords.join(" ");
  const area = "0," + height + " " + line + " " + width + "," + height;

  const first = points[0];
  const last = points[points.length - 1];
  const drift = last.keluScore - first.keluScore;

  const DriftIcon = drift > 0.5 ? TrendingUp : drift < -0.5 ? TrendingDown : Minus;
  const driftClass =
    drift > 0.5 ? "text-emerald-300" : drift < -0.5 ? "text-red-400" : "text-slate-400";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-slate-500">Timeline</h3>
        <div className={"flex items-center gap-1.5 text-xs font-medium " + driftClass}>
          <DriftIcon className="size-3.5" />
          {drift > 0 ? "+" : ""}
          {drift.toFixed(1)} over {points.length} snapshots
        </div>
      </div>

      <svg
        viewBox={"0 0 " + width + " " + height}
        preserveAspectRatio="none"
        className="h-16 w-full"
        role="img"
        aria-label="KeluScore over time"
      >
        <polygon points={area} fill="rgba(34,211,238,0.12)" />
        <polyline
          points={line}
          fill="none"
          stroke="rgb(34,211,238)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex justify-between text-[11px] text-slate-600">
        <span>{new Date(first.capturedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
        <span>{new Date(last.capturedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
      </div>
    </div>
  );
}

/**
 * The Intent section shown on a token page.
 *
 * Purely presentational: it receives already-computed data and renders it.
 * Adding this to a page cannot slow that page down beyond the single query
 * that fetched the row.
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

      <ScoreTimeline points={history} />

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
