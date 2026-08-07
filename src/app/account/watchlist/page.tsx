import Link from "next/link";

import { FollowChannelButton } from "@/components/account/follow-channel-button";
import { getWatchlist } from "@/lib/account/queries";

export default async function WatchlistPage() {
  const entries = await getWatchlist();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Your watchlist</h2>
        <p className="mt-1 text-sm text-slate-400">
          Channels you follow. These feed your alerts and your personalised activity feed.
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
                <div className="min-w-0">
                  <Link
                    href={`/channel/${channel.slug}`}
                    className="font-medium text-white transition hover:text-cyan-300"
                  >
                    {channel.title}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    @{channel.telegramHandle}
                  </p>
                </div>

                <FollowChannelButton
                  channelId={channel.id}
                  initialFollowing
                  isSignedIn
                  size="sm"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
