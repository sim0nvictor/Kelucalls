import Link from "next/link";

import { MarkAllReadButton } from "@/components/account/mark-all-read-button";
import { NotificationItem } from "@/components/account/notification-item";
import { notificationsEnabled } from "@/lib/account/alert-options";
import { getNotificationPage, getUnreadNotificationCount } from "@/lib/account/queries";
import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";
import { getCurrentProfile } from "@/lib/auth/session";

const NOTIFICATIONS_PATH = `${ACCOUNT_BASE_PATH}/notifications`;
const PAGE_SIZE = 25;

/**
 * Formatted on the server in a fixed zone so the string is identical wherever
 * it renders. Relative times ("3 hours ago") would drift between server and
 * client and produce hydration warnings.
 */
const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC"
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${TIMESTAMP_FORMAT.format(date)} UTC`;
}

function pageHref(unreadOnly: boolean, page: number): string {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("filter", "unread");
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  return query ? `${NOTIFICATIONS_PATH}?${query}` : NOTIFICATIONS_PATH;
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

export default async function NotificationsPage({
  searchParams
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const filterRaw = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const unreadOnly = filterRaw === "unread";
  const page = parsePage(params.page);
  const offset = (page - 1) * PAGE_SIZE;

  const [{ notifications, hasMore }, unreadCount, profile] = await Promise.all([
    getNotificationPage(PAGE_SIZE, offset, unreadOnly),
    getUnreadNotificationCount(),
    getCurrentProfile()
  ]);

  const masterEnabled = notificationsEnabled(profile?.preferences);

  const tabs = [
    { label: "All", active: !unreadOnly, href: pageHref(false, 1) },
    {
      label: unreadCount > 0 ? `Unread (${unreadCount})` : "Unread",
      active: unreadOnly,
      href: pageHref(true, 1)
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Notifications</h2>
          <p className="mt-1 text-sm text-slate-400">
            Everything your alerts have sent you, newest first.
          </p>
        </div>
        <MarkAllReadButton unreadCount={unreadCount} />
      </div>

      {!masterEnabled && (
        <p className="rounded-xl border border-white/8 bg-white/4 p-4 text-sm text-amber-300">
          All notifications are switched off, so nothing new will arrive here.{" "}
          <Link
            href={`${ACCOUNT_BASE_PATH}/alerts`}
            className="font-medium underline underline-offset-4"
          >
            Turn them back on
          </Link>
          .
        </p>
      )}

      <nav aria-label="Filter notifications" className="flex gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              tab.active
                ? "bg-cyan-500/10 text-cyan-300"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
          <p className="text-sm text-slate-400">
            {unreadOnly
              ? "Nothing unread. You are all caught up."
              : "No notifications yet. When an alert you have set up fires, it lands here."}
          </p>
          {!unreadOnly && (
            <Link
              href={`${ACCOUNT_BASE_PATH}/alerts`}
              className="mt-4 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Set up an alert
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              timestamp={formatTimestamp(notification.createdAt)}
            />
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between gap-4 pt-2">
          {page > 1 ? (
            <Link
              href={pageHref(unreadOnly, page - 1)}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              Newer
            </Link>
          ) : (
            <span />
          )}

          <span className="text-xs uppercase tracking-widest text-slate-500">
            Page {page}
          </span>

          {hasMore ? (
            <Link
              href={pageHref(unreadOnly, page + 1)}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
            >
              Older
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
