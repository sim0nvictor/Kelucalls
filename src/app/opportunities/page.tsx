import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Info } from "lucide-react";

import { OpportunityCard } from "@/components/opportunities/opportunity-card";
import { getTopOpportunities } from "@/lib/intent/queries";
import { parseGrade, parseNumber } from "@/lib/intent/http";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Opportunities - KeluScore",
  description:
    "Tokens ranked by KeluScore, combining caller conviction, momentum, breadth, and realised performance into a single intent signal."
};

const GRADE_FILTERS = [
  { value: null, label: "All" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "C", label: "C" },
  { value: "D", label: "D" }
] as const;

type PageProps = {
  searchParams: Promise<{ grade?: string; minScore?: string }>;
};

export default async function OpportunitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const grade = parseGrade(params.grade ?? null);
  const minScore = parseNumber(params.minScore ?? null);

  const opportunities = await getTopOpportunities({ limit: 48, grade, minScore });

  const isFiltered = grade !== null || minScore !== undefined;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="rounded-[2rem] border border-white/10 bg-slate-950/75 px-6 py-8 shadow-[0_0_80px_rgba(8,145,178,0.10)] sm:px-8">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-cyan-400" />
          <span className="text-xs uppercase tracking-widest text-cyan-300">KeluScore</span>
        </div>

        <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Opportunities</h1>

        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
          Every tracked token scored out of 100. The KeluScore blends how credible the
          callers are, how fast activity is accelerating, how many independent channels
          are involved, and how previous calls actually performed. Ranked highest first.
        </p>

        {/* Grade filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-slate-500">Grade</span>
          {GRADE_FILTERS.map((filter) => {
            const active = grade === filter.value;
            const href = filter.value ? "/opportunities?grade=" + filter.value : "/opportunities";

            return (
              <Link
                key={filter.label}
                href={href}
                className={
                  active
                    ? "rounded-full bg-cyan-500/15 px-3 py-1 text-xs font-medium text-cyan-300"
                    : "rounded-full px-3 py-1 text-xs font-medium text-slate-400 transition hover:bg-white/8 hover:text-white"
                }
              >
                {filter.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Results */}
      {opportunities.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-white">
              {opportunities.length} {opportunities.length === 1 ? "token" : "tokens"}
            </h2>
            {isFiltered && (
              <Link href="/opportunities" className="text-xs text-cyan-300 hover:text-cyan-200">
                Clear filters
              </Link>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {opportunities.map((opportunity, index) => (
              <OpportunityCard
                key={opportunity.token.id}
                opportunity={opportunity}
                rank={isFiltered ? undefined : index + 1}
              />
            ))}
          </div>
        </>
      ) : (
        <section className="rounded-2xl border border-white/8 bg-white/4 px-6 py-12 text-center">
          <Info className="mx-auto size-6 text-slate-600" />

          {isFiltered ? (
            <>
              <h2 className="mt-4 text-lg font-semibold text-white">No tokens match this filter</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                Nothing currently sits in this grade band. Try a broader grade, or clear the
                filter to see the full ranking.
              </p>
              <Link
                href="/opportunities"
                className="mt-6 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                Clear filters
              </Link>
            </>
          ) : (
            <>
              <h2 className="mt-4 text-lg font-semibold text-white">No scores calculated yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                KeluScores are produced by a background worker rather than on page load.
                Once it has run against recent calls, ranked tokens will appear here.
              </p>
              <Link
                href="/trending"
                className="mt-6 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400"
              >
                Browse trending tokens
              </Link>
            </>
          )}
        </section>
      )}

      <p className="text-center text-[11px] text-slate-600">
        KeluScore is research tooling built from public call data. It is not financial advice.
      </p>
    </div>
  );
}
