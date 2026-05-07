import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminSession } from "@/lib/admin-auth";
import { getLeaderboard } from "@/lib/dashboard-data";
import { withSupabase } from "@/lib/supabase";

type AdminChannelsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function AdminChannelsPage({ searchParams }: AdminChannelsPageProps) {
  await requireAdminSession();
  const { q } = await searchParams;
  const query = (q || "").trim().toLowerCase();

  const leaderboard = await getLeaderboard("smart", 100);
  const channels = await withSupabase(async (supabase) => {
    const { data, error } = await supabase
      .from("channels")
      .select("id, slug, title, telegram_handle, status, is_paid_channel, is_verified")
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data ?? []) as Array<Record<string, unknown>>;
  }, []);

  const performanceById = new Map(leaderboard.map((channel) => [channel.id, channel]));
  const filtered = channels.filter((channel) => {
    if (!query) {
      return true;
    }

    return [channel.title, channel.slug, channel.telegram_handle]
      .map((value) => String(value || "").toLowerCase())
      .some((value) => value.includes(query));
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Badge>Channel management</Badge>
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Manage tracked channels</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
              Edit public metadata, moderation state, and paid-placement flags without altering rank
              calculations.
            </p>
          </div>
        </div>
        <Link href="/admin">
          <Button variant="secondary">Back to admin</Button>
        </Link>
      </section>

      <Card>
        <CardContent className="space-y-4">
          <form>
            <input
              type="search"
              name="q"
              defaultValue={q || ""}
              placeholder="Search by title, slug, or handle"
              className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
            />
          </form>
          <div className="text-sm text-slate-400">{filtered.length} channels</div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {filtered.map((channel) => {
          const stats = performanceById.get(String(channel.id));

          return (
            <Card key={String(channel.id)}>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="border-white/10 bg-white/5 text-slate-200">
                        {String(channel.status)}
                      </Badge>
                      {channel.is_verified ? (
                        <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                          Verified
                        </Badge>
                      ) : null}
                      {channel.is_paid_channel ? (
                        <Badge className="border-orange-400/20 bg-orange-400/10 text-orange-200">
                          Paid placement only
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-white">{String(channel.title)}</h2>
                    <div className="mt-2 text-sm text-slate-400">
                      @{String(channel.telegram_handle)} • /channel/{String(channel.slug)}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Link href={`/admin/channels/${channel.id}`}>
                      <Button>Edit</Button>
                    </Link>
                    <Link href={`/channel/${channel.slug}`}>
                      <Button variant="secondary">View report</Button>
                    </Link>
                  </div>
                </div>
                {stats ? (
                  <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-4">
                    <Metric label="Avg ROI" value={`${stats.averageRoiPct.toFixed(1)}%`} />
                    <Metric label="Win rate" value={`${stats.winRatePct.toFixed(1)}%`} />
                    <Metric label="Calls" value={String(stats.totalCalls)} />
                    <Metric label="PnL" value={`$${stats.simulatedCurrentPnlUsd.toFixed(0)}`} />
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No computed stats yet.</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-900/80 p-3">
      <div className="text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
