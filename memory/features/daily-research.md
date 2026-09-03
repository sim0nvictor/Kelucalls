## Daily Research Generator

**What it is:** A JSON-first daily research report generated from one normalized `DailyResearchSnapshot` and its deterministic `ResearchSignalsBlock`.

**How it works:** `src/lib/research/generator.ts` sends the LLM exactly two structured values: `research_snapshot` and `signal_results`. The system prompt forbids invented prices, percentages, dates, events, quotes, sources, KOL opinions, token statistics, predictions, and investment recommendations. The model must return twelve section objects, each with concise `content` and JSON-path `evidence` references.

**Safety boundary:** The response is parsed as JSON, every required section is required exactly once, and every evidence reference must be one of the supplied snapshot or signal paths. A response that is not JSON, omits a section, adds a section, or cites unsupplied evidence is rejected. Null and missing provider data must remain unavailable rather than becoming a claim.

**Publication gate:** `src/lib/research/validator.ts` checks every report section and source metadata for numerical claims, dates, URLs, quoted text, and evidence references against the exact snapshot. It returns `valid`, `errors`, `warnings`, and `verified_claims`; `saveDailyResearchReport()` refuses to persist any report with `valid: false` and never silently corrects it.

**Sources and disclaimer:** Source entries are assembled from provider status and normalized news items by code, so the model cannot invent URLs or publication dates. The financial disclaimer is fixed in code and the report does not contain buy, sell, or hold recommendations.

**Persistence and execution:** Migration `014_daily_research_reports.sql` adds the internal `generated_report` JSONB column to `research_snapshots`. `workers/daily-research.ts` collects and saves the snapshot, generates the report, persists it, and creates a matching `articles` row through `src/lib/research/article.ts` with `status = 'draft'`. The existing `/kx-admin/insights` editor remains the review and publishing workflow; no generated report is auto-published. Article creation is idempotent per generator and snapshot date. Run with `npm run worker:research`; focused checks are `npm run verify:research-generator` and `npm run verify:research-validator`.

**Automation:** Migration `015_research_run.sql` adds one UTC execution row per day with `pending`, `collecting`, `analyzing`, `generating`, `validating`, `draft`, and `failed` states, provider outcomes, duration, validation JSON, and article/report identifiers. The worker is one-shot and intended for the existing deployment platform's cron facility; this repository has no schedule in `railway.json`, so scheduling must remain an external Railway Cron Job or worker service. A manual run must succeed after migrations are applied before enabling it.

**Operational status (2026-08-28):** The manual run was attempted and stopped before collection because the linked Supabase project does not yet expose `public.research_run` (`PGRST205`). The Supabase CLI is installed but the project is not linked, so migration application was not performed. The worker now emits structured failure JSON and no schedule has been enabled.

**Type safety fix (2026-08-31):** `workers/daily-research.ts` must type the generated report as the awaited `DailyResearchReport`, not `ReturnType<typeof generateDailyResearchReport>`, because the latter is `Promise<DailyResearchReport>`. See `memory/fixes/FIX-004.md`.
