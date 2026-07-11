import {
  approveSubmissionAction,
  deleteChannelAction,
  rejectSubmissionAction,
  reviewModerationReportAction,
  updateChannelModerationAction,
} from "@/app/kx-admin/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatusPill } from "@/components/admin/status-pill";
import { ConfirmDeleteButton } from "@/components/admin/confirm-delete-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listAdminChannels, listModerationReports, listPendingSubmissions } from "@/lib/admin/data";
import { requireAdminIdentity } from "@/lib/admin/auth";

// NO <AdminSidebar /> — protected layout already renders it

type ModerationPageProps = {
  searchParams: Promise<{
    approved?: string;
    rejected?: string;
    saved?: string;
    deleted?: string;
    error?: string;
  }>;
};

export default async function ModerationPage({ searchParams }: ModerationPageProps) {
  await requireAdminIdentity();
  const params = await searchParams;
  const [submissions, reports, channels] = await Promise.all([
    listPendingSubmissions(),
    listModerationReports(),
    listAdminChannels(),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        badge="Moderation"
        title="Trust and abuse controls"
        description="Review reports, manage channel status, approve or reject submissions. Delete removes the channel and all its data permanently."
      />

          {(params.approved === "1" || params.rejected === "1" || params.saved === "1") && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Moderation action completed.
            </div>
          )}
          {params.deleted === "1" && (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              Channel permanently deleted from the database.
            </div>
          )}
          {params.error && (
            <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
              Moderation action failed validation.
            </div>
          )}

          {/* ── Submissions + Reports ─────────────────────────────────── */}
          <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="border-white/8 bg-[#0a1323]/82">
              <CardContent className="space-y-4">
                <h2 className="text-2xl font-semibold text-white">Submission queue</h2>
                <div className="space-y-3">
                  {submissions.length > 0 ? (
                    submissions.map((sub) => (
                      <div key={sub.id} className="rounded-2xl border border-white/8 bg-slate-950/70 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-lg font-semibold text-white">{sub.channel_name}</div>
                            <div className="mt-1 text-sm text-cyan-300">@{sub.telegram_handle}</div>
                            <div className="mt-2 text-sm text-slate-400">
                              {sub.description || "No description supplied."}
                            </div>
                          </div>
                          {sub.fast_track_requested && <AdminStatusPill value="reviewing" />}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <form action={approveSubmissionAction}>
                            <input type="hidden" name="submissionId" value={sub.id} />
                            <Button type="submit">Approve</Button>
                          </form>
                          <form action={rejectSubmissionAction}>
                            <input type="hidden" name="submissionId" value={sub.id} />
                            <Button type="submit" variant="secondary">Reject</Button>
                          </form>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                      No pending submissions.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/8 bg-[#0a1323]/82">
              <CardContent className="space-y-4">
                <h2 className="text-2xl font-semibold text-white">Reports</h2>
                <div className="space-y-3">
                  {reports.length > 0 ? (
                    reports.map((report) => (
                      <div key={report.id} className="rounded-2xl border border-white/8 bg-slate-950/70 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm text-cyan-300">{report.reportType}</div>
                            <div className="mt-1 text-lg font-semibold text-white">{report.reason}</div>
                            <div className="mt-1 text-sm text-slate-400">
                              {report.channelTitle || report.tokenSymbol || report.submissionName || "Manual report"}
                            </div>
                            {report.details && (
                              <div className="mt-2 text-sm text-slate-500">{report.details}</div>
                            )}
                          </div>
                          <AdminStatusPill value={report.status} />
                        </div>
                        <form action={reviewModerationReportAction} className="mt-4 grid gap-3">
                          <input type="hidden" name="reportId" value={report.id} />
                          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
                            <select
                              name="nextStatus"
                              defaultValue={report.status === "open" ? "reviewing" : report.status}
                              className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white"
                            >
                              {["reviewing", "resolved", "dismissed"].map((v) => (
                                <option key={v} value={v}>{v}</option>
                              ))}
                            </select>
                            <input
                              name="resolutionNotes"
                              placeholder="Resolution notes"
                              className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white"
                            />
                            <Button type="submit" variant="secondary">Update</Button>
                          </div>
                        </form>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
                      No reports in the queue.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ── Channel controls ────────────────────────────────────── */}
          <Card className="border-white/8 bg-[#0a1323]/82">
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-white">Channel controls</h2>
                <span className="text-xs text-slate-500">{channels.length} channels</span>
              </div>
              <div className="grid gap-3">
                {channels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-slate-950/70 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div>
                      <div className="font-semibold text-white">{channel.title}</div>
                      <div className="mt-0.5 text-sm text-slate-400">/{channel.slug}</div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* Status update */}
                      <form action={updateChannelModerationAction} className="flex flex-wrap items-center gap-3">
                        <input type="hidden" name="channelId" value={channel.id} />
                        <select
                          name="nextStatus"
                          defaultValue={channel.status}
                          className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-white"
                        >
                          {["pending", "active", "paused", "archived"].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                        <Button type="submit" variant="secondary" size="sm">Save</Button>
                      </form>

                      {/* Hard delete — ConfirmDeleteButton is "use client" */}
                      <form action={deleteChannelAction}>
                        <input type="hidden" name="channelId" value={channel.id} />
                        <ConfirmDeleteButton
                          confirmMessage={`Permanently delete "${channel.title}" and ALL its calls and stats? This CANNOT be undone.`}
                          label="Delete"
                        />
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
    </div>
  );
}