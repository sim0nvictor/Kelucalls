"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";

/**
 * Navbar notification bell.
 *
 * Fetches its own unread count instead of receiving it as a prop, and that is
 * deliberate. The navbar renders on every page including the static marketing
 * ones; reading the session during render would force all of them to render
 * dynamically and cost a query per page view. Fetching after hydration keeps
 * those pages cacheable and confines the cost to signed-in users, which is
 * also what lets the navbar stay session-free.
 */

const NOTIFICATIONS_PATH = `${ACCOUNT_BASE_PATH}/notifications`;
const UNREAD_ENDPOINT = "/api/notifications/unread-count";

type BellState = { signedIn: boolean; unreadCount: number };

export function NotificationBell({
  mobile = false,
  onNavigate
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<BellState | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(UNREAD_ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;

        const data = (await res.json()) as Partial<BellState>;
        if (cancelled) return;

        setState({
          signedIn: Boolean(data.signedIn),
          unreadCount: Number(data.unreadCount) || 0
        });
      } catch {
        // Offline or unreachable. Keep whatever we last showed rather than
        // flashing a count that might be wrong.
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Re-checked on navigation so the badge clears once the inbox is read.
  }, [pathname]);

  // Anonymous visitors get no bell. Before the first response lands we render
  // nothing rather than a zero that may turn out to be wrong.
  if (!state || !state.signedIn) return null;

  const { unreadCount } = state;
  const isActive = pathname.startsWith(NOTIFICATIONS_PATH);
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  const dot = unreadCount > 0 && (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold leading-none text-slate-950">
      {badge}
    </span>
  );

  if (mobile) {
    return (
      <Link
        href={NOTIFICATIONS_PATH}
        onClick={onNavigate}
        aria-label={label}
        className={`mt-2 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
          isActive
            ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
            : "border-white/10 bg-white/5 text-slate-200"
        }`}
      >
        <span className="relative flex">
          <Bell className="size-5" />
          {dot}
        </span>
        Notifications
      </Link>
    );
  }

  return (
    <Link
      href={NOTIFICATIONS_PATH}
      title={label}
      aria-label={label}
      className={`group relative ml-1 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-2.5 py-2 text-sm font-medium transition-all ${
        isActive
          ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-300"
          : "border-white/10 text-slate-300 hover:bg-white/8 hover:text-white"
      }`}
    >
      <span className="relative flex">
        <Bell className={`size-4 shrink-0 ${isActive ? "text-cyan-400" : ""}`} />
        {dot}
      </span>
      <span className="hidden 2xl:inline">Notifications</span>
    </Link>
  );
}
