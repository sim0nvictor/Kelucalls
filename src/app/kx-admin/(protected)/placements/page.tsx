import {
  createSponsoredPlacementV2Action,
  deleteSponsoredPlacementAction,
  toggleSponsoredPlacementStatusAction,
} from "@/app/kx-admin/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatusPill } from "@/components/admin/status-pill";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listAdminChannels, listSponsoredPlacements } from "@/lib/admin/data";
import { requireAdminIdentity } from "@/lib/admin/auth";
import { DateRangePicker } from "@/components/admin/date-range-picker";

// NO <AdminSidebar /> — protected layout already renders it

type PlacementsPageProps = {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    error?: string;
    tab?: string;
  }>;
};

export default async function PlacementsPage({ searchParams }: PlacementsPageProps) {
  await requireAdminIdentity();
  const params = await searchParams;

  const [placements, channels] = await Promise.all([
    listSponsoredPlacements(),
    listAdminChannels(),
  ]);

  const activeTab        = params.tab === "token" ? "token" : "channel";
  const channelPlacements = placements.filter((p) => p.placementSubtype === "channel_placement");
  const tokenPlacements   = placements.filter((p) => p.placementSubtype === "token_placement");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        badge="Sponsored placements"
        title="Sponsored placements"
        description="Channel placements inject into the leaderboard. Token placements appear at the top of trending, tokens, and live feed pages. All labeled Sponsored."
      />

          {params.created === "1" && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              ✓ Placement created and scheduled.
            </div>
          )}
          {params.deleted === "1" && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Placement deleted.
            </div>
          )}
          {params.error && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              {params.error === "channel_required"
                ? "Select a channel for a channel placement."
                : params.error === "token_required"
                ? "Token symbol is required for a token placement."
                : "Check all required fields."}
            </div>
          )}

          {/* Tab switcher */}
          <div className="flex gap-3">
            <a href="?tab=channel">
              <Button variant={activeTab === "channel" ? "default" : "secondary"} size="sm">
                Channel placements
              </Button>
            </a>
            <a href="?tab=token">
              <Button variant={activeTab === "token" ? "default" : "secondary"} size="sm">
                Token placements
              </Button>
            </a>
          </div>

          {activeTab === "channel" ? (
            <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
              {/* Create channel placement */}
              <Card className="border-white/8 bg-[#0a1323]/82 self-start">
                <CardContent className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Feature a channel</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Appears as a sponsored card in the leaderboard after rank 5, clearly labeled.
                    </p>
                  </div>
                  <form action={createSponsoredPlacementV2Action} className="grid gap-4">
                    <input type="hidden" name="placementSubtype" value="channel_placement" />

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Channel to feature
                      </label>
                      <select
                        name="channelId"
                        required
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white focus:border-cyan-400/40 focus:outline-none"
                      >
                        <option value="">Select a channel</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>{ch.title}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Display title
                      </label>
                      <input
                        name="title"
                        required
                        placeholder="e.g. Top Solana caller this month"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Short description
                      </label>
                      <textarea
                        name="creativeCopy"
                        rows={2}
                        placeholder="e.g. High-accuracy calls with 80%+ win rate."
                        className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Link destination
                      </label>
                      <input
                        name="destinationUrl"
                        required
                        placeholder="https://kelucalls.com/channels/slug"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    {/* Date picker dropdowns — no manual typing, no past dates */}
                    <DateRangePicker />

                    <input type="hidden" name="priority" value="100" />
                    <Button type="submit" className="w-full">Create channel placement</Button>
                  </form>
                </CardContent>
              </Card>

              {/* Channel placements list */}
              <Card className="border-white/8 bg-[#0a1323]/82">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">Channel placements</h2>
                    <span className="text-xs text-slate-500">{channelPlacements.length} total</span>
                  </div>
                  {channelPlacements.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">
                      No channel placements yet.
                    </p>
                  ) : (
                    channelPlacements.map((p) => (
                      <PlacementRow key={p.id} placement={p} />
                    ))
                  )}
                </CardContent>
              </Card>
            </section>
          ) : (
            <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
              {/* Create token placement */}
              <Card className="border-white/8 bg-[#0a1323]/82 self-start">
                <CardContent className="space-y-5">
                  <div>
                    <h2 className="text-xl font-semibold text-white">Feature a token</h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Appears at the top of trending, tokens, and live feed. Links to DexScreener.
                    </p>
                  </div>
                  <form action={createSponsoredPlacementV2Action} className="grid gap-4">
                    <input type="hidden" name="placementSubtype" value="token_placement" />

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Token symbol
                      </label>
                      <input
                        name="tokenSymbol"
                        required
                        placeholder="e.g. BONK"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Contract address
                      </label>
                      <input
                        name="contractAddress"
                        required
                        placeholder="e.g. DezXAZ8z7PnrnRJjz3wXBoRgixCa..."
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm font-mono text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                      <p className="text-xs text-slate-600">Used to build the DexScreener link and identify the token.</p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Token logo URL
                      </label>
                      <input
                        name="logoUrl"
                        placeholder="https://... (token logo image)"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Where to show
                      </label>
                      <select
                        name="surface"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white focus:border-cyan-400/40 focus:outline-none"
                      >
                        <option value="trending">Trending page</option>
                        <option value="tokens">Tokens page</option>
                        <option value="live_feed">Live feed page</option>
                        <option value="homepage">Homepage live feed card</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Display title
                      </label>
                      <input
                        name="title"
                        required
                        placeholder="e.g. BONK — Featured Token"
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Promo copy
                      </label>
                      <textarea
                        name="creativeCopy"
                        rows={2}
                        placeholder="e.g. Trending across 40+ channels on Kelucalls."
                        className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Destination link
                      </label>
                      <input
                        name="destinationUrl"
                        required
                        placeholder="https://dexscreener.com/solana/..."
                        className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                      />
                    </div>

                    {/* Date picker dropdowns — no manual typing, no past dates */}
                    <DateRangePicker />

                    <input type="hidden" name="priority" value="100" />
                    <Button type="submit" className="w-full">Create token placement</Button>
                  </form>
                </CardContent>
              </Card>

              {/* Token placements list */}
              <Card className="border-white/8 bg-[#0a1323]/82">
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-white">Token placements</h2>
                    <span className="text-xs text-slate-500">{tokenPlacements.length} total</span>
                  </div>
                  {tokenPlacements.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-slate-500">
                      No token placements yet.
                    </p>
                  ) : (
                    tokenPlacements.map((p) => (
                      <PlacementRow key={p.id} placement={p} />
                    ))
                  )}
                </CardContent>
              </Card>
            </section>
          )}
    </div>
  );
}

// ── Placement row — server component, server actions on forms directly ────
function PlacementRow({ placement }: {
  placement: {
    id: string;
    title: string;
    status: string;
    placementSubtype: string;
    channelTitle: string;
    tokenSymbol: string | null;
    surface: string;
    startsAt: string;
    endsAt: string | null;
  };
}) {
  const isActive   = placement.status === "active";
  const isChannel  = placement.placementSubtype === "channel_placement";

  return (
    <div className="rounded-xl border border-white/6 bg-slate-950/50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-400">
              {isChannel ? "Channel" : "Token"}
            </span>
            <span className="truncate font-medium text-white">{placement.title}</span>
            <AdminStatusPill value={placement.status} />
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {isChannel
              ? placement.channelTitle || "Unassigned"
              : `${placement.tokenSymbol ?? "?"} · ${placement.surface}`}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {new Date(placement.startsAt).toLocaleDateString()}
            {" → "}
            {placement.endsAt ? new Date(placement.endsAt).toLocaleDateString() : "No end"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <form action={toggleSponsoredPlacementStatusAction}>
            <input type="hidden" name="placementId" value={placement.id} />
            <input type="hidden" name="nextStatus" value={isActive ? "paused" : "active"} />
            <Button size="sm" variant={isActive ? "secondary" : "default"} type="submit">
              {isActive ? "Pause" : "Activate"}
            </Button>
          </form>

          <form action={deleteSponsoredPlacementAction}>
            <input type="hidden" name="placementId" value={placement.id} />
            <ConfirmDeleteButton
              confirmMessage={`Delete "${placement.title}"? This cannot be undone.`}
            />
          </form>
        </div>
      </div>
    </div>
  );
}