import { Sparkles } from "lucide-react";

import type { IntentSummary as IntentSummaryData } from "@/lib/intent/queries";

/**
 * The machine-written narrative for a token.
 *
 * A separate component rather than more markup inside IntentPanel so that the
 * panel does not grow another responsibility, and so this can be dropped onto
 * other surfaces later without moving code.
 *
 * Renders nothing at all when there is no summary. A token with no cached
 * narrative shows the rest of the Intent section unchanged, rather than an
 * empty box or placeholder prose.
 *
 * The type import is erased at compile time, so importing from the queries
 * module does not pull server-only code into this component.
 */
export function IntentSummary({ summary }: { summary: IntentSummaryData | null }) {
  if (!summary) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-violet-400/15 bg-violet-400/5 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-violet-300" />
        <h3 className="text-xs uppercase tracking-widest text-violet-300">Summary</h3>
      </div>

      <p className="text-sm leading-relaxed text-slate-300">{summary.summary}</p>

      <p className="text-[11px] text-slate-600">
        Written by {summary.model} from the score data above on{" "}
        {new Date(summary.generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}.
        Machine generated, so read it as a starting point rather than a conclusion.
      </p>
    </div>
  );
}
