import Link from "next/link";

import { ACCOUNT_BASE_PATH } from "@/lib/auth/constants";
import { getAlertRules } from "@/lib/account/queries";

const RULE_LABELS: Record<string, string> = {
  channel_new_call: "New call posted",
  channel_big_win: "Big win from this caller",
  token_trending: "Token starts trending",
  watchlist_digest: "Daily watchlist digest",
  token_intent_spike: "KeluScore moves sharply"
};

function ruleLabel(ruleType: string) {
  return RULE_LABELS[ruleType] ?? ruleType.replace(/_/g, " ");
}

export default async function AlertsPage() {
  const rules = await getAlertRules();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Alerts</h2>
        <p className="mt-1 text-sm text-slate-400">
          Get notified when the callers you follow post, when a call runs, or when a token
          starts trending.
        </p>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
          <p className="text-sm text-slate-400">
            No alerts set up yet. Follow a channel first, then come back here to choose what
            you want to be told about.
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
                <p className="font-medium text-white">{ruleLabel(rule.ruleType)}</p>
                <p className="mt-0.5 truncate text-sm text-slate-500">
                  {rule.channel ? rule.channel.title : "Across all channels"}
                  {" - "}
                  {rule.deliveryChannels.join(", ")}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  rule.isActive
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "bg-white/5 text-slate-500"
                }`}
              >
                {rule.isActive ? "Active" : "Paused"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
