"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createAlertRuleAction } from "@/lib/account/actions";
import {
  AVAILABLE_ALERT_OPTIONS,
  VOLUME_HINTS,
  alertOptionFor
} from "@/lib/account/alert-options";

export type ChannelChoice = { id: string; title: string };

const SELECT_CLASSES =
  "w-full rounded-lg border border-white/10 bg-slate-900/70 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/40";

/**
 * Create an alert rule.
 *
 * Only rule types with a live dispatcher are offered, so nothing created here
 * can sit dead. Channel-scoped types require a channel because
 * user_alert_rules_target_chk enforces it in the database - the select is not
 * cosmetic.
 *
 * Duplicates are blocked client side. There is no unique constraint on
 * (user_id, rule_type, channel_id), so without this it is easy to end up with
 * the same alert three times and wonder why every notification arrives in
 * triplicate.
 */
export function CreateAlertForm({
  channels,
  existingKeys
}: {
  channels: ChannelChoice[];
  existingKeys: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ruleType, setRuleType] = useState(AVAILABLE_ALERT_OPTIONS[0]?.ruleType ?? "");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const selected = alertOptionFor(ruleType);
  const needsChannel = selected?.scope === "channel";
  const missingChannel = needsChannel && channels.length === 0;
  const duplicateKey = `${ruleType}:${needsChannel ? channelId : ""}`;
  const isDuplicate = existingKeys.includes(duplicateKey);

  const blocked = !selected || missingChannel || isDuplicate || isPending;

  function handleSubmit() {
    if (!selected || missingChannel || isDuplicate) return;

    setError(null);
    startTransition(async () => {
      const result = await createAlertRuleAction({
        ruleType: selected.ruleType,
        channelId: selected.scope === "channel" ? channelId : null,
        conditions: selected.defaultConditions
      });

      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  if (AVAILABLE_ALERT_OPTIONS.length === 0) return null;

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
      <div>
        <p className="font-medium text-white">Add an alert</p>
        <p className="mt-1 text-sm text-slate-400">
          Pick what you want to hear about. You can pause or delete it at any time.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-widest text-slate-500">
            Alert type
          </span>
          <select
            value={ruleType}
            onChange={(event) => setRuleType(event.target.value)}
            className={SELECT_CLASSES}
          >
            {AVAILABLE_ALERT_OPTIONS.map((option) => (
              <option key={option.ruleType} value={option.ruleType}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {needsChannel ? (
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-widest text-slate-500">
              Caller
            </span>
            <select
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              disabled={channels.length === 0}
              className={SELECT_CLASSES}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {selected ? (
        <p className="text-sm text-slate-400">
          {selected.description}{" "}
          <span className="text-slate-500">
            Expected volume: {VOLUME_HINTS[selected.volume].toLowerCase()}.
          </span>
        </p>
      ) : null}

      {missingChannel ? (
        <p className="text-sm text-amber-300">
          Follow at least one caller before setting up this alert.
        </p>
      ) : null}

      {isDuplicate ? (
        <p className="text-sm text-amber-300">You already have this alert.</p>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={blocked}
        className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Adding..." : "Add alert"}
      </button>
    </div>
  );
}
