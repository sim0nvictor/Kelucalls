/**
 * LeaderboardWithPlacements
 *
 * Drop-in replacement for the leaderboard grid in page.tsx.
 * Inserts a sponsored channel placement card right after rank 5 (0-indexed: 4).
 * Sponsored cards are visually distinct but match the grid layout.
 */

import { ChannelCard } from "@/components/channel-card";
import { SponsoredPlacementCard } from "@/components/sponsored-placement-card";
import type { ChannelSummary, SponsoredPlacement } from "@/types/kelucalls";

type Props = {
  channels: ChannelSummary[];
  placements: SponsoredPlacement[];
};

// Insert sponsored cards after these 0-based rank positions.
// "below top 5" = after index 4 (rank 5). Second slot after index 5 (rank 6)
// if a second placement exists.
const INJECT_AFTER_RANK = [4, 5];

export function LeaderboardWithPlacements({ channels, placements }: Props) {
  // Only channel placements belong on the leaderboard
  const channelPlacements = placements.filter((p) => p.placementSubtype === "channel_placement");

  if (channelPlacements.length === 0) {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        {channels.map((channel, index) => (
          <ChannelCard key={channel.id} channel={channel} rank={index + 1} />
        ))}
      </div>
    );
  }

  type Item =
    | { kind: "channel"; channel: ChannelSummary; rank: number }
    | { kind: "sponsored"; placement: SponsoredPlacement };

  const items: Item[] = [];
  let placementIndex = 0;

  channels.forEach((channel, index) => {
    items.push({ kind: "channel", channel, rank: index + 1 });

    if (
      INJECT_AFTER_RANK.includes(index) &&
      placementIndex < channelPlacements.length
    ) {
      items.push({ kind: "sponsored", placement: channelPlacements[placementIndex] });
      placementIndex++;
    }
  });

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {items.map((item) => {
        if (item.kind === "channel") {
          return (
            <ChannelCard
              key={item.channel.id}
              channel={item.channel}
              rank={item.rank}
            />
          );
        }

        return (
          <div key={`sponsored-${item.placement.id}`} className="xl:col-span-2">
            <SponsoredPlacementCard placement={item.placement} />
          </div>
        );
      })}
    </div>
  );
}