"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markNotificationReadAction } from "@/lib/account/notification-actions";
import { LOGIN_PATH } from "@/lib/auth/constants";
// Type-only import: erased at compile time, so pulling a type out of a
// server-only module does not drag the module into the client bundle.
import type { AccountNotification } from "@/lib/account/queries";

/**
 * One row in the notification inbox.
 *
 * `timestamp` arrives preformatted from the server rather than being built
 * here from the ISO string. Formatting a date on both sides of hydration is a
 * classic mismatch: the server has one locale and time zone, the browser has
 * another.
 */
export function NotificationItem({
  notification,
  timestamp
}: {
  notification: AccountNotification;
  timestamp: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [readAt, setReadAt] = useState<string | null>(notification.readAt);
  const [error, setError] = useState<string | null>(null);

  const isUnread = !readAt;

  function markRead(refresh: boolean) {
    if (!isUnread) return;

    setError(null);
    setReadAt(new Date().toISOString());

    startTransition(async () => {
      const result = await markNotificationReadAction(notification.id);

      if (!result.ok) {
        setReadAt(null);

        if (result.code === "unauthenticated") {
          router.push(LOGIN_PATH);
          return;
        }
        setError(result.error ?? "Something went wrong.");
        return;
      }

      if (refresh) router.refresh();
    });
  }

  const title = notification.url ? (
    <Link
      href={notification.url}
      onClick={() => markRead(false)}
      className="font-medium text-white transition hover:text-cyan-300"
    >
      {notification.title}
    </Link>
  ) : (
    <span className="font-medium text-white">{notification.title}</span>
  );

  return (
    <li
      className={`flex items-start justify-between gap-4 rounded-xl border p-4 transition ${
        isUnread
          ? "border-cyan-500/20 bg-cyan-500/5"
          : "border-white/10 bg-slate-950/60"
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {isUnread ? (
          <span
            className="mt-1.5 size-2 shrink-0 rounded-full bg-cyan-400"
            aria-label="Unread"
          />
        ) : (
          <span className="mt-1.5 size-2 shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0">
          {title}
          {notification.body && (
            <p className="mt-1 text-sm text-slate-400">{notification.body}</p>
          )}
          <p className="mt-1.5 text-xs text-slate-500">{timestamp}</p>
          {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
        </div>
      </div>

      {isUnread && (
        <button
          type="button"
          onClick={() => markRead(true)}
          disabled={isPending}
          className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Mark read
        </button>
      )}
    </li>
  );
}
