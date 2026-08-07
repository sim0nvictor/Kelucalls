import type { IntentGrade } from "@/lib/intent/types";

const GRADE_STYLES: Record<IntentGrade, string> = {
  A: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  B: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
  C: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  D: "border-white/10 bg-white/5 text-slate-400"
};

/** Small grade pill, used in lists. */
export function GradePill({ grade }: { grade: IntentGrade }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold " +
        GRADE_STYLES[grade]
      }
    >
      {grade}
    </span>
  );
}

/** Large headline score, used at the top of the Intent panel. */
export function ScoreBadge({
  score,
  grade,
  size = "lg"
}: {
  score: number;
  grade: IntentGrade;
  size?: "md" | "lg";
}) {
  const numberClass =
    size === "lg"
      ? "text-5xl font-semibold tracking-tight text-white"
      : "text-3xl font-semibold tracking-tight text-white";

  return (
    <div className="flex items-center gap-3">
      <div className={numberClass}>{Math.round(score)}</div>
      <div className="space-y-1">
        <GradePill grade={grade} />
        <div className="text-[10px] uppercase tracking-widest text-slate-500">out of 100</div>
      </div>
    </div>
  );
}
