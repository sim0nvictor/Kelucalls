"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setAlertRuleActiveAction, setChannelMilestonesAction } from "@/lib/account/actions";

const MILESTONES = [2, 10, 100] as const;

export function ChannelMilestoneSettings({
  ruleId,
  initialMilestones,
  initialActive
}: {
  ruleId: string | null;
  initialMilestones: number[];
  initialActive: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>(initialMilestones);
  const [saved, setSaved] = useState<number[]>(initialMilestones);
  const [active, setActive] = useState(initialActive);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(milestone: number, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...current, milestone].sort((a, b) => a - b)
        : current.filter((value) => value !== milestone)
    );
    setError(null);
  }

  function toggleActive() {
    if (!ruleId || isPending) return;
    const next = !active;
    setActive(next);
    startTransition(async () => {
      const result = await setAlertRuleActiveAction(ruleId, next);
      if (!result.ok) {
        setActive(!next);
        setError(result.error ?? "Could not update alert status.");
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  function save() {
    if (!ruleId || selected.length === 0 || isPending) return;

    startTransition(async () => {
      const result = await setChannelMilestonesAction(ruleId, selected);
      if (!result.ok) {
        setError(result.error ?? "Could not save alert settings.");
        return;
      }
      setSaved(selected);
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="min-w-0 rounded-lg border border-white/8 bg-white/[0.025] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-300">Notify at</p>
        {ruleId ? (
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={active ? "Pause channel milestone alerts" : "Enable channel milestone alerts"}
            onClick={toggleActive}
            disabled={isPending}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition disabled:opacity-50 ${active ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-slate-500"}`}
          >
            {active ? "Alerts on" : "Alerts paused"}
          </button>
        ) : (
          <span className="text-[10px] text-slate-500">Alert rule unavailable</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-3">
        {MILESTONES.map((milestone) => (
          <label key={milestone} className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={selected.includes(milestone)}
              onChange={(event) => toggle(milestone, event.target.checked)}
              disabled={!ruleId || isPending}
              className="size-3.5 accent-cyan-400"
            />
            {milestone}x
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[10px] text-slate-500">In-app notifications</p>
        <button
          type="button"
          onClick={save}
          disabled={!ruleId || selected.length === 0 || isPending || (selected.length === saved.length && selected.every((value) => saved.includes(value)))}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-cyan-300 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
      {selected.length === 0 ? <p className="mt-1 text-[10px] text-amber-300">Select at least one milestone.</p> : null}
      {error ? <p role="status" className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
