"use client";

import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setWatchlistMutedAction } from "@/lib/account/actions";

/**
 * Per-caller mute, stored on user_channel_watchlist.is_muted.
 *
 * This is the distinction the whole alert design rests on: following a caller
 * is a bookmark, and being notified about them is a separate opt-in. Muting
 * keeps the follow and silences the caller across every alert type rather
 * than per rule.
 */
export function MuteChannelToggle({
  entryId,
  initialMuted
}: {
  entryId: string;
  initialMuted: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [muted, setMuted] = useState(initialMuted);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const next = !muted;
    setMuted(next);
    setError(null);

    startTransition(async () => {
      const result = await setWatchlistMutedAction(entryId, next);
      if (!result.ok) {
        setMuted(!next);
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  const Icon = muted ? BellOff : Bell;

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={!muted}
        title={muted ? "Notifications muted for this caller" : "Notifications on for this caller"}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
          muted
            ? "border-white/15 bg-white/5 text-slate-500 hover:border-cyan-500/50 hover:text-cyan-300"
            : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:border-white/25 hover:bg-white/5 hover:text-slate-300"
        }`}
      >
        <Icon aria-hidden="true" className="size-3.5" />
        {muted ? "Muted" : "Notify"}
      </button>
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </span>
  );
}
