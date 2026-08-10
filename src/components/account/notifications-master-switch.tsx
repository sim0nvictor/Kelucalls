"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setNotificationsEnabledAction } from "@/lib/account/notification-actions";

/**
 * The one switch that overrides everything else.
 *
 * Follows the FollowChannelButton pattern: optimistic local state, roll back
 * on failure, router.refresh() on success so the server-rendered copy around
 * it updates too.
 */
export function NotificationsMasterSwitch({
  initialEnabled
}: {
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    setError(null);

    startTransition(async () => {
      const result = await setNotificationsEnabledAction(next);
      if (!result.ok) {
        setEnabled(!next);
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-white">All notifications</p>
          <p className="mt-1 text-sm text-slate-400">
            {enabled
              ? "On. Individual alerts below decide what you actually receive."
              : "Off. Nothing will be sent, whatever the alerts below say."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="All notifications"
          onClick={handleToggle}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-60 ${
            enabled ? "bg-cyan-500" : "bg-white/15"
          }`}
        >
          <span
            className={`inline-block size-4 rounded-full bg-white transition ${
              enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
