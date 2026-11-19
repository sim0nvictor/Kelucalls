import Link from "next/link";

import { FollowChannelButton } from "@/components/account/follow-channel-button";
import { MuteChannelToggle } from "@/components/account/mute-channel-toggle";
import { ChannelMilestoneSettings } from "@/components/account/channel-milestone-settings";
import { getWatchlist } from "@/lib/account/queries";

export default async function WatchlistPage() {
  const entries = await getWatchlist();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Your watchlist</h2>
        <p className="mt-1 text-sm text-slate-400">
          Channels you follow. Performance alerts are enabled by default; choose which
          milestones matter to you, or mute a channel at any time.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
          <p className="text-sm text-slate-400">
            You are not following any channels yet.
          </p>
          <Link
            href="/channels"
            className="mt-4 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Find channels to follow
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => {
            const channel = entry.channel;
            if (!channel) return null;

            return (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-slate-950/60 p-4"
              >
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <Link
                      href={`/channels/${channel.slug}`}
                      className="font-medium text-white transition hover:text-cyan-300"
                    >
                      {channel.title}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      @{channel.telegramHandle}
                    </p>
                  </div>
                  <ChannelMilestoneSettings
                    ruleId={entry.alertRuleId}
                    initialMilestones={entry.alertMilestones}
                    initialActive={entry.alertActive}
                  />
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <MuteChannelToggle entryId={entry.id} initialMuted={entry.isMuted} />
                  <FollowChannelButton
                    channelId={channel.id}
                    initialFollowing
                    isSignedIn
                    size="sm"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
