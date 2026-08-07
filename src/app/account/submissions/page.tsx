import Link from "next/link";

import { getAccountSubmissions } from "@/lib/account/queries";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-300",
  approved: "bg-emerald-500/10 text-emerald-300",
  rejected: "bg-red-500/10 text-red-300"
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export default async function SubmissionsPage() {
  const submissions = await getAccountSubmissions();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Your submissions</h2>
        <p className="mt-1 text-sm text-slate-400">
          Channels you have submitted for listing, and where each one is in review.
        </p>
      </div>

      {submissions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center">
          <p className="text-sm text-slate-400">
            No submissions yet.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Submissions you made before creating an account will not appear here - only
            channels submitted while signed in are linked to your account.
          </p>
          <Link
            href="/submit"
            className="mt-4 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Submit a channel
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {submissions.map((submission) => (
            <li
              key={submission.id}
              className="rounded-xl border border-white/10 bg-slate-950/60 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-white">{submission.channelName}</p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    @{submission.telegramHandle} - submitted {formatDate(submission.createdAt)}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                    STATUS_STYLES[submission.status] ?? "bg-white/5 text-slate-400"
                  }`}
                >
                  {submission.status}
                </span>
              </div>

              {submission.reviewNotes ? (
                <p className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-slate-400">
                  {submission.reviewNotes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
