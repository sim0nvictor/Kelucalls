"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteAlertRuleAction, setAlertRuleActiveAction } from "@/lib/account/actions";

/**
 * Pause / resume and delete for a single alert rule.
 *
 * Pausing sets is_active = false and keeps the row, so thresholds and
 * delivery choices survive being turned off and back on. Deleting is a
 * separate, two-step action because it is not recoverable.
 */
export function AlertRuleControls({
  ruleId,
  initialActive
}: {
  ruleId: string;
  initialActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(initialActive);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !active;
    setActive(next);
    setError(null);

    startTransition(async () => {
      const result = await setAlertRuleActiveAction(ruleId, next);
      if (!result.ok) {
        setActive(!next);
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await deleteAlertRuleAction(ruleId);
      if (!result.ok) {
        setConfirmingDelete(false);
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={active ? "Pause this alert" : "Resume this alert"}
          onClick={handleToggle}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
            active ? "bg-cyan-500" : "bg-white/15"
          }`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white transition ${
              active ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
            confirmingDelete
              ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
              : "text-slate-500 hover:text-red-300"
          }`}
        >
          {confirmingDelete ? "Really delete?" : "Delete"}
        </button>
      </div>

      {confirmingDelete && !isPending ? (
        <button
          type="button"
          onClick={() => setConfirmingDelete(false)}
          className="text-xs text-slate-500 transition hover:text-slate-300"
        >
          Cancel
        </button>
      ) : null}

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
