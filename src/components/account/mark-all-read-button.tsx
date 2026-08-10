"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markAllNotificationsReadAction } from "@/lib/account/actions";
import { LOGIN_PATH } from "@/lib/auth/constants";

/**
 * Clears the unread state for every notification.
 *
 * The action behind this has existed since the account area shipped and had no
 * caller, which is why the unread dot on /account could never be dismissed.
 */
export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (unreadCount === 0) return null;

  function onClick() {
    setError(null);

    startTransition(async () => {
      const result = await markAllNotificationsReadAction();

      if (!result.ok) {
        if (result.code === "unauthenticated") {
          router.push(LOGIN_PATH);
          return;
        }
        setError(result.error ?? "Something went wrong.");
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Marking..." : "Mark all as read"}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
