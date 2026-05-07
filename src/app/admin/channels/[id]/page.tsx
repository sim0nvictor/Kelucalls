import Link from "next/link";
import { notFound } from "next/navigation";

import { updateChannel } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminSession } from "@/lib/admin-auth";
import { withSupabase } from "@/lib/supabase";

type AdminChannelEditorPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminChannelEditorPage({
  params,
  searchParams
}: AdminChannelEditorPageProps) {
  await requireAdminSession();

  const { id } = await params;
  const { saved, error } = await searchParams;

  const channel = await withSupabase(async (supabase) => {
    const { data, error: queryError } = await supabase
      .from("channels")
      .select("id, slug, title, telegram_handle, telegram_url, description, status, is_paid_channel, is_verified, notes")
      .eq("id", id)
      .maybeSingle();

    if (queryError) {
      throw queryError;
    }

    return data;
  }, null);

  if (!channel) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <Badge>Channel editor</Badge>
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">{channel.title}</h1>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              This editor controls public channel metadata, moderation status, and paid-placement
              labeling. It does not alter ranking formulas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/channels">
            <Button variant="secondary">Back to channels</Button>
          </Link>
          <Link href={`/channel/${channel.slug}`}>
            <Button>Open report</Button>
          </Link>
        </div>
      </div>

      {saved === "1" ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          Channel saved successfully.
        </div>
      ) : null}
      {error === "invalid" ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          Invalid channel payload.
        </div>
      ) : null}

      <Card>
        <CardContent className="p-6 sm:p-8">
          <form action={updateChannel} className="space-y-6">
            <input type="hidden" name="channelId" value={channel.id} />

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="title" label="Title" defaultValue={channel.title} />
              <Field name="slug" label="Slug" defaultValue={channel.slug} />
              <Field name="telegramHandle" label="Telegram handle" defaultValue={channel.telegram_handle} />
              <Field name="telegramUrl" label="Telegram URL" defaultValue={channel.telegram_url} />
            </div>

            <label className="grid gap-2 text-sm text-slate-300">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Description
              </span>
              <textarea
                name="description"
                defaultValue={channel.description ?? ""}
                rows={5}
                className="rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
              />
            </label>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Status
                </span>
                <select
                  name="status"
                  defaultValue={channel.status}
                  className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
                >
                  {["pending", "active", "paused", "archived"].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Notes
                </span>
                <textarea
                  name="notes"
                  defaultValue={channel.notes ?? ""}
                  rows={3}
                  className="rounded-3xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  name="isVerified"
                  defaultChecked={Boolean(channel.is_verified)}
                  className="size-4"
                />
                Verified channel
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  name="isPaidChannel"
                  defaultChecked={Boolean(channel.is_paid_channel)}
                  className="size-4"
                />
                Paid placement only
              </label>
            </div>

            <div className="flex gap-3">
              <Button type="submit">Save channel</Button>
              <Link href="/admin/channels">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <label className="grid gap-2 text-sm text-slate-300">
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none focus:border-cyan-400/40"
      />
    </label>
  );
}
