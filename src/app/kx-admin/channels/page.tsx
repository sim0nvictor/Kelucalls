
import { requireAdminIdentity } from "@/lib/admin/auth";
import { createAdminDb } from "@/lib/admin/data";
import { ADMIN_BASE_PATH } from "@/lib/admin/constants";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminStatusPill } from "@/components/admin/status-pill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { updateChannelAction, deleteChannelAction } from "@/app/kx-admin/actions";
import { ChannelAvatar } from "@/components/channel-avatar";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";

type PageProps = {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string; deleted?: string }>;
};

async function getChannels() {
  const db = createAdminDb();
  const { data, error } = await db
    .from("channels")
    .select("id, slug, title, telegram_handle, telegram_url, description, status, avatar_url, is_verified, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export default async function AdminChannelsPage({ searchParams }: PageProps) {
  await requireAdminIdentity();
  const params = await searchParams;
  const channels = await getChannels();
  const editingId = params.edit ?? null;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <AdminSidebar />

        <div className="flex-1 space-y-6">
          <AdminPageHeader
            badge="Channel management"
            title="Channels"
            description="Edit channel titles, descriptions, and status. Changes reflect immediately on the public leaderboard."
          />

          {params.saved && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Channel updated successfully.
            </div>
          )}
          {params.deleted && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Channel deleted successfully.
            </div>
          )}
          {params.error && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              Something went wrong. Please try again.
            </div>
          )}

          <div className="space-y-3">
            {channels.map((channel) => {
              const isEditing = editingId === channel.id;

              return (
                <Card key={channel.id} className="border-white/8 bg-slate-950/70">
                  <CardContent className="p-5">
                    {isEditing ? (
                      // ── Edit form ──────────────────────────────────────
                      <form action={updateChannelAction} className="space-y-4">
                        <input type="hidden" name="channelId" value={channel.id} />

                        <div className="flex items-center gap-3">
                          <ChannelAvatar
                            src={channel.avatar_url}
                            title={channel.title}
                            size={40}
                          />
                          <div className="text-sm text-slate-400">
                            {channel.telegram_handle}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                              Title
                            </label>
                            <input
                              name="title"
                              defaultValue={channel.title}
                              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                              Status
                            </label>
                            <select
                              name="status"
                              defaultValue={channel.status}
                              className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
                            >
                              <option value="active">Active</option>
                              <option value="paused">Paused</option>
                              <option value="archived">Archived</option>
                              <option value="pending">Pending</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                            Description
                          </label>
                          <textarea
                            name="description"
                            defaultValue={channel.description ?? ""}
                            rows={3}
                            placeholder="Short description of what this channel calls — shown on channel cards and reports."
                            className="w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50 placeholder-slate-600 resize-none"
                          />
                          <p className="text-xs text-slate-600">
                            This shows under the channel name on all public pages.
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <Button type="submit" size="sm">
                            Save changes
                          </Button>
                          <a href={`${ADMIN_BASE_PATH}/channels`}>
                            <Button type="button" variant="secondary" size="sm">
                              Cancel
                            </Button>
                          </a>
                        </div>
                      </form>
                    ) : (
                      // ── Read view ──────────────────────────────────────
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <ChannelAvatar
                            src={channel.avatar_url}
                            title={channel.title}
                            size={40}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white truncate">
                                {channel.title}
                              </span>
                              <AdminStatusPill value={channel.status} />
                              {channel.is_verified && (
                                <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200 text-xs">
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {channel.telegram_handle}
                            </div>
                            <p className="mt-1.5 text-sm text-slate-400 line-clamp-2">
                              {channel.description ?? (
                                <span className="text-slate-600 italic">
                                  No description — click Edit to add one.
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <a
                            href={`${ADMIN_BASE_PATH}/channels?edit=${channel.id}`}
                          >
                            <Button variant="secondary" size="sm">
                              Edit
                            </Button>
                          </a>
                          <a
                            href={channel.telegram_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Button variant="ghost" size="sm" className="text-xs">
                              TG ↗
                            </Button>
                          </a>
                          <form action={deleteChannelAction}>
                            <input type="hidden" name="channelId" value={channel.id} />
                              <ConfirmDeleteButton
                              confirmMessage={`Permanently delete "${channel.title}"? This cannot be undone.`}
                            />
                          </form>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            {channels.length === 0 && (
              <Card className="border-white/8 bg-slate-950/70">
                <CardContent className="py-12 text-center text-slate-500">
                  No channels yet.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}