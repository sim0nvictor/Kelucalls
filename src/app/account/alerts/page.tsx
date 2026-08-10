import Link from "next/link";

import { AlertRuleControls } from "@/components/account/alert-rule-controls";
import { CreateAlertForm } from "@/components/account/create-alert-form";
import { NotificationsMasterSwitch } from "@/components/account/notifications-master-switch";
import {
  UPCOMING_ALERT_OPTIONS,
  alertLabel,
  notificationsEnabled
} from "@/lib/account/alert-options";
import { getAlertRules, getWatchlist } from "@/lib/account/queries";
import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";
import { getCurrentProfile } from "@/lib/auth/session";

export default async function AlertsPage() {
  const [rules, watchlist, profile] = await Promise.all([
    getAlertRules(),
    getWatchlist(),
    getCurrentProfile()
  ]);

  const channels = watchlist
    .filter((entry) => entry.channel !== null)
    .map((entry) => ({ id: entry.channel!.id, title: entry.channel!.title }));

  // Matches the key the create form builds, so it can grey out duplicates.
  const existingKeys = rules.map(
    (rule) => `${rule.ruleType}:${rule.channel ? rule.channel.id : ""}`
  );

  const masterEnabled = notificationsEnabled(profile?.preferences);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Alerts</h2>
        <p className="mt-1 text-sm text-slate-400">
          Choose what you want to be told about. Following a caller is a bookmark, being
          notified about them is a separate choice you make here.
        </p>
      </div>

      <NotificationsMasterSwitch initialEnabled={masterEnabled} />

      <CreateAlertForm channels={channels} existingKeys={existingKeys} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Your alerts
        </h3>

        {rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
            <p className="text-sm text-slate-400">
              No alerts yet. Add one above, or follow a few callers first so there is
              something to be notified about.
            </p>
            <Link
              href={`${ACCOUNT_BASE_PATH}/watchlist`}
              className="mt-4 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Go to your watchlist
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/60 p-4"
              >
                <div className="min-w-0">
                  <p
                    className={`font-medium ${
                      rule.isActive && masterEnabled ? "text-white" : "text-slate-500"
                    }`}
                  >
                    {alertLabel(rule.ruleType)}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {rule.channel ? rule.channel.title : "Across all channels"}
                    {" - "}
                    {rule.deliveryChannels.join(", ")}
                    {rule.isActive ? "" : " - paused"}
                  </p>
                </div>

                <AlertRuleControls ruleId={rule.id} initialActive={rule.isActive} />
              </li>
            ))}
          </ul>
        )}

        {rules.length > 0 && !masterEnabled ? (
          <p className="text-sm text-amber-300">
            These are switched on, but nothing will be sent while all notifications are
            off above.
          </p>
        ) : null}
      </div>

      {UPCOMING_ALERT_OPTIONS.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Coming soon
          </h3>
          <ul className="space-y-2">
            {UPCOMING_ALERT_OPTIONS.map((option) => (
              <li
                key={option.ruleType}
                className="rounded-xl border border-white/8 bg-white/4 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-300">{option.label}</p>
                  <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-500">
                    Soon
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{option.description}</p>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-600">
            These are not offered yet because there is nothing behind them to send the
            alert. They will appear above as each one goes live.
          </p>
        </div>
      ) : null}
    </div>
  );
}
