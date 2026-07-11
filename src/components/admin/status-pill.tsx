export function AdminStatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const className =
    normalized === "active" || normalized === "resolved"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : normalized === "paused" || normalized === "reviewing"
        ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
        : normalized === "open" || normalized === "draft"
          ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
          : "border-rose-400/20 bg-rose-400/10 text-rose-200";

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ${className}`}>
      {value}
    </span>
  );
}
