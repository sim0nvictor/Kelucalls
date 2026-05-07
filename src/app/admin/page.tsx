import Link from "next/link";

import { approveSubmission, logoutAdmin, rejectSubmission } from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardSnapshot, getPendingSubmissions } from "@/lib/dashboard-data";
import { requireAdminSession } from "@/lib/admin-auth";

export default async function AdminPage() {
  await requireAdminSession();

  const [snapshot, submissions] = await Promise.all([
    getDashboardSnapshot("smart"),
    getPendingSubmissions(12)
  ]);

  const stats = [
    { label: "Tracked channels", value: snapshot.totals.trackedChannels },
    { label: "Tracked calls", value: snapshot.totals.trackedCalls },
    { label: "Sponsored slots", value: snapshot.sponsoredPlacements.length },
    { label: "Pending submissions", value: submissions.length }
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
            Control room
          </Badge>
          <div>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">Kelucalls admin</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">
              Moderate submissions, inspect tracked coverage, and manage public channel records without
              mixing monetization into rankings.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/admin/channels">
            <Button>Manage channels</Button>
          </Link>
          <form action={logoutAdmin}>
            <Button variant="secondary" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent>
              <div className="text-sm text-slate-500">{stat.label}</div>
              <div className="mt-3 text-3xl font-semibold text-white">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">Top ranked channels</h2>
            <div className="space-y-3">
              {snapshot.leaderboard.slice(0, 6).map((channel, index) => (
                <div key={channel.id} className="rounded-2xl border border-white/8 bg-slate-900/80 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm text-cyan-300">Rank #{index + 1}</div>
                      <div className="mt-1 text-lg font-semibold text-white">{channel.title}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {channel.totalCalls} calls • {channel.winRatePct.toFixed(1)}% win rate
                      </div>
                    </div>
                    <Link href={`/admin/channels/${channel.id}`}>
                      <Button size="sm" variant="secondary">
                        Edit
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">Submission queue</h2>
            {submissions.length > 0 ? (
              <div className="space-y-3">
                {submissions.map((submission) => (
                  <div key={submission.id} className="rounded-2xl border border-white/8 bg-slate-900/80 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-white">{submission.channelName}</div>
                        <div className="mt-1 text-sm text-cyan-300">@{submission.telegramHandle}</div>
                      </div>
                      {submission.fastTrackRequested ? (
                        <Badge className="border-orange-400/20 bg-orange-400/10 text-orange-200">
                          Fast-track
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-400">
                      {submission.description || "No description supplied."}
                    </p>
                    <div className="mt-4 flex gap-3">
                      <form action={approveSubmission}>
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <Button type="submit">Approve</Button>
                      </form>
                      <form action={rejectSubmission}>
                        <input type="hidden" name="submissionId" value={submission.id} />
                        <Button type="submit" variant="secondary">
                          Reject
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 p-6 text-sm text-slate-400">
                No pending submissions right now.
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
