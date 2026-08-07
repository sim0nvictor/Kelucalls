import { formatScore } from "@/lib/intent/types";

/**
 * A single sub-score row with a proportional bar.
 *
 * Handles null explicitly. A null sub-score means NO DATA COLLECTED YET, which
 * is rendered as a dash and an empty track - never as a zero-length bar, which
 * would wrongly read as "scored badly".
 */
export function ScoreBar({
  label,
  value,
  hint,
  accent = "cyan"
}: {
  label: string;
  value: number | null;
  hint?: string;
  accent?: "cyan" | "emerald" | "violet";
}) {
  const unavailable = value === null;

  const accentClass =
    accent === "emerald"
      ? "bg-emerald-400"
      : accent === "violet"
        ? "bg-violet-400"
        : "bg-cyan-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs uppercase tracking-widest text-slate-500">{label}</span>
        <span
          className={
            unavailable
              ? "text-sm font-semibold text-slate-600"
              : "text-sm font-semibold text-white"
          }
        >
          {formatScore(value)}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
        {!unavailable && (
          <div
            className={"h-full rounded-full " + accentClass}
            style={{ width: Math.max(0, Math.min(100, value)) + "%" }}
          />
        )}
      </div>

      {unavailable ? (
        <p className="text-[11px] text-slate-600">Not collected yet</p>
      ) : hint ? (
        <p className="text-[11px] text-slate-600">{hint}</p>
      ) : null}
    </div>
  );
}
