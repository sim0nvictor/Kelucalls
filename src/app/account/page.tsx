import Link from "next/link";

import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";
import { getAccountOverview } from "@/lib/account/queries";

function StatCard({
  label,
  value,
  href,
  hint
}: {
  label: string;
  value: number;
  href: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 transition hover:border-cyan-500/40 hover:bg-slate-900/60"
    >
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </Link>
  );
}

export default async function AccountOverviewPage() {
  const overview = await getAccountOverview();

  return (
    <div className="space-y-10">
      <section>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Channels followed"
            value={overview.watchlistCount}
            href={`${ACCOUNT_BASE_PATH}/watchlist`}
          />
          <StatCard
            label="Active alerts"
            value={overview.activeAlertCount}
            href={`${ACCOUNT_BASE_PATH}/alerts`}
          />
          <StatCard
            label="Submissions"
            value={overview.submissionCount}
            href={`${ACCOUNT_BASE_PATH}/submissions`}
            hint={
              overview.pendingSubmissionCount > 0
                ? `${overview.pendingSubmissionCount} awaiting review`
                : undefined
            }
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white">Recent activity</h2>

        {overview.notifications.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
            <p className="text-sm text-slate-400">
              Nothing here yet. Follow a few callers and set up an alert - new calls from
              channels on your watchlist will show up here.
            </p>
            <Link
              href="/top-callers"
              className="mt-4 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Browse top callers
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {overview.notifications.map((notification) => (
              <li
                key={notification.id}
                className="rounded-xl border border-white/10 bg-slate-950/60 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium text-white">
                      {notification.url ? (
                        <Link href={notification.url} className="hover:text-cyan-300">
                          {notification.title}
                        </Link>
                      ) : (
                        notification.title
                      )}
                    </p>
                    {notification.body ? (
                      <p className="mt-1 text-sm text-slate-400">{notification.body}</p>
                    ) : null}
                  </div>
                  {!notification.readAt ? (
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-cyan-400" aria-label="Unread" />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
