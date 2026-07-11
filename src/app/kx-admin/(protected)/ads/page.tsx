import { requireAdminIdentity } from "@/lib/admin/auth";
import { listAdminAds } from "@/lib/admin/data";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatusPill } from "@/components/admin/status-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  createAdAction,
  deleteAdAction,
  toggleAdStatusAction,
} from "@/app/kx-admin/actions";
import { AdBannerUploader } from "@/components/admin/ad-banner-uploader";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { DateRangePicker } from "@/components/admin/date-range-picker";

// NO <AdminSidebar /> here — the protected layout already renders it

type AdsPageProps = {
  searchParams: Promise<{ created?: string; deleted?: string; error?: string; saved?: string }>;
};

export default async function AdsPage({ searchParams }: AdsPageProps) {
  await requireAdminIdentity();
  const params = await searchParams;
  const ads = await listAdminAds();
  const activeAds = ads.filter((a) => a.status === "active");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        badge="Ads"
        title="Ads manager"
        description="Floating popup ads for any project or platform. Upload a banner image and set a destination link — no channel link required."
      />

      {params.created === "1" && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          ✓ Ad created successfully.
        </div>
      )}
      {params.saved === "1" && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          Ad status updated.
        </div>
      )}
      {params.deleted === "1" && (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
          Ad deleted.
        </div>
      )}
      {params.error && (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {params.error === "invalid"
            ? "Please fill in all required fields correctly."
            : params.error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        {/* ── Create ad form ──────────────────────────────────────────────── */}
        <Card className="border-white/8 bg-[#0a1323]/82 self-start">
          <CardContent className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-white">Create a new ad</h2>
              <p className="mt-1 text-sm text-slate-400">
                Appears as a floating popup card to site visitors. No channel required.
              </p>
            </div>

            <form action={createAdAction} className="grid gap-4">
              {/* Client island — uploads image, writes hidden inputs */}
              <AdBannerUploader />

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Ad label <span className="text-slate-600">(internal name)</span>
                </label>
                <input
                  name="label"
                  required
                  placeholder="e.g. CryptoProject – July 2026"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Destination link
                </label>
                <input
                  name="destinationUrl"
                  required
                  placeholder="https://yourproject.com"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Short promo text <span className="text-slate-600">(optional)</span>
                </label>
                <textarea
                  name="creativeCopy"
                  rows={2}
                  placeholder="e.g. The fastest DEX on Solana. Trade smarter."
                  className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white placeholder-slate-600 focus:border-cyan-400/40 focus:outline-none"
                />
              </div>

              {/* Date picker — client island, prevents past dates, no manual typing */}
              <DateRangePicker />

              {/* Hidden fields — defaults */}
              <input type="hidden" name="placement" value="homepage" />
              <input type="hidden" name="priority" value="100" />
              <input type="hidden" name="status" value="draft" />

              <Button type="submit" className="w-full">Create ad</Button>
            </form>
          </CardContent>
        </Card>

        {/* ── Ads list ─────────────────────────────────────────────────────── */}
        <div className="space-y-5">
          {activeAds.length > 0 && (
            <Card className="border-white/8 bg-[#0a1323]/82">
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                  <h2 className="text-base font-semibold text-white">Live now</h2>
                  <span className="ml-auto text-xs text-slate-500">{activeAds.length} active</span>
                </div>
                {activeAds.map((ad) => (
                  <AdRow key={ad.id} ad={ad} />
                ))}
              </CardContent>
            </Card>
          )}

          <Card className="border-white/8 bg-[#0a1323]/82">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-white">All ads</h2>
                <span className="text-xs text-slate-500">{ads.length} total</span>
              </div>
              {ads.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 py-6 text-center text-sm text-slate-500">
                  No ads yet — create your first one.
                </p>
              ) : (
                ads.map((ad) => <AdRow key={ad.id} ad={ad} />)
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

// ── Ad row ─────────────────────────────────────────────────────────────────────
function AdRow({ ad }: {
  ad: {
    id: string;
    label: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
    imageUrl: string | null;
    creativeCopy: string | null;
  };
}) {
  const isActive = ad.status === "active";

  return (
    <div className="rounded-xl border border-white/6 bg-slate-950/50 p-4">
      <div className="flex items-start gap-4">
        {ad.imageUrl && (
          <div className="shrink-0 overflow-hidden rounded-lg border border-white/8" style={{ width: 80, height: 36 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ad.imageUrl} alt={ad.label} className="h-full w-full object-cover" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-white">{ad.label}</span>
            <AdminStatusPill value={ad.status} />
          </div>
          {ad.creativeCopy && (
            <p className="mt-1 text-xs text-slate-500 line-clamp-1">{ad.creativeCopy}</p>
          )}
          <div className="mt-1.5 text-xs text-slate-600">
            {new Date(ad.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            {" → "}
            {ad.endsAt
              ? new Date(ad.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "No end date"}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <form action={toggleAdStatusAction}>
            <input type="hidden" name="adId" value={ad.id} />
            <input type="hidden" name="nextStatus" value={isActive ? "paused" : "active"} />
            <Button size="sm" variant={isActive ? "secondary" : "default"} type="submit">
              {isActive ? "Pause" : "Activate"}
            </Button>
          </form>

          <form action={deleteAdAction}>
            <input type="hidden" name="adId" value={ad.id} />
            <ConfirmDeleteButton confirmMessage={`Delete ad "${ad.label}"? This cannot be undone.`} />
          </form>
        </div>
      </div>
    </div>
  );
}