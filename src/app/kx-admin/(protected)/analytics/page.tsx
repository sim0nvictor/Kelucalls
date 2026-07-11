import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatCard } from "@/components/admin/stat-card";
import { AdminStatusPill } from "@/components/admin/status-pill";
import { Card, CardContent } from "@/components/ui/card";
import { getAnalyticsSummary } from "@/lib/admin/data";

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export default async function AnalyticsPage() {
  const analytics = await getAnalyticsSummary();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        badge="Analytics"
        title="Monetization performance"
        description="CTR, impression volume, and sponsored placement engagement are aggregated from internal event tables and limited to the last 30 days for a cleaner operational signal."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <AdminStatCard label="Window" value={analytics.windowLabel} helper="Rolling performance view" />
        <AdminStatCard label="Impressions" value={String(analytics.totals.impressions)} helper="Ads and placements combined" />
        <AdminStatCard label="CTR" value={formatPercent(analytics.totals.ctr)} helper={`${analytics.totals.clicks} tracked clicks`} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card className="border-white/8 bg-[#0a1323]/82">
          <CardContent className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">Ads performance</h2>
            <div className="space-y-3">
              {analytics.ads.map((ad) => (
                <div key={ad.id} className="rounded-2xl border border-white/8 bg-slate-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-white">{ad.label}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {ad.impressions} impressions • {ad.clicks} clicks
                      </div>
                    </div>
                    <AdminStatusPill value={ad.status} />
                  </div>
                  <div className="mt-3 text-sm text-cyan-300">CTR {formatPercent(ad.ctr)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/8 bg-[#0a1323]/82">
          <CardContent className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">Sponsored placements</h2>
            <div className="space-y-3">
              {analytics.placements.map((placement) => (
                <div key={placement.id} className="rounded-2xl border border-white/8 bg-slate-950/70 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-semibold text-white">{placement.title}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {placement.impressions} impressions • {placement.clicks} clicks
                      </div>
                    </div>
                    <AdminStatusPill value={placement.status} />
                  </div>
                  <div className="mt-3 text-sm text-cyan-300">CTR {formatPercent(placement.ctr)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
