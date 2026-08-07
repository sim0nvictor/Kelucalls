begin;

-- ============================================================================
-- KeluScore (TM) - Crypto Intent Engine
--
-- Additive only. This migration creates four NEW tables and does not alter,
-- rename or drop anything that already exists. Existing analytics
-- (channel_stats, trending_tokens, call_metrics) remain the source of truth
-- and are read, never written, by the intent engine.
--
-- Data flow:
--   calls + call_metrics + channel_stats + trending_tokens   (existing)
--     -> workers/intent-engine.js                            (new)
--       -> intent_scores      current score per token
--       -> intent_history     time series for charts
--       -> score_changes      material moves, for alerts
--       -> project_signals    raw external signals (Dexscreener, X)
--
-- Design notes for future feature work:
--   * The app NEVER computes a score at request time. It reads intent_scores.
--     That keeps page loads cheap and means the scoring model can change
--     without touching the UI.
--   * marketing_score, community_score and liquidity_score are NULLABLE on
--     purpose. Null means "not enough data yet", which the UI must render as
--     unavailable rather than as a zero. Never default these to 0.
--   * project_signals is a generic (source, signal_type, value) bag so a new
--     external data source is a new source string, not a new table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- intent_scores - current KeluScore for a token. One row per token.
-- ----------------------------------------------------------------------------
create table if not exists public.intent_scores (
  token_id uuid primary key references public.tokens(id) on delete cascade,

  -- Headline composite, 0-100.
  kelu_score numeric(6,2) not null default 0,
  grade text not null default 'D',

  -- Sub-scores computed from data Kelucalls already owns.
  conviction_score numeric(6,2) not null default 0,
  momentum_score numeric(6,2) not null default 0,
  breadth_score numeric(6,2) not null default 0,
  performance_score numeric(6,2) not null default 0,
  freshness_score numeric(6,2) not null default 0,

  -- Sub-scores that depend on external ingestion. NULL until data exists.
  marketing_score numeric(6,2),
  community_score numeric(6,2),
  liquidity_score numeric(6,2),

  -- Denormalised counters so the Opportunities list needs no joins.
  calls_24h integer not null default 0,
  calls_7d integer not null default 0,
  calls_30d integer not null default 0,
  unique_channels integer not null default 0,

  -- Human readable output for the Intent tab.
  signals jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,

  -- Raw inputs kept for transparency and debugging: shows WHY a score moved.
  inputs jsonb not null default '{}'::jsonb,

  computed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint intent_scores_kelu_range check (kelu_score >= 0 and kelu_score <= 100),
  constraint intent_scores_grade_chk check (grade in ('A', 'B', 'C', 'D')),
  constraint intent_scores_conviction_range check (conviction_score >= 0 and conviction_score <= 100),
  constraint intent_scores_momentum_range check (momentum_score >= 0 and momentum_score <= 100),
  constraint intent_scores_breadth_range check (breadth_score >= 0 and breadth_score <= 100),
  constraint intent_scores_performance_range check (performance_score >= 0 and performance_score <= 100),
  constraint intent_scores_freshness_range check (freshness_score >= 0 and freshness_score <= 100),
  constraint intent_scores_marketing_range check (marketing_score is null or (marketing_score >= 0 and marketing_score <= 100)),
  constraint intent_scores_community_range check (community_score is null or (community_score >= 0 and community_score <= 100)),
  constraint intent_scores_liquidity_range check (liquidity_score is null or (liquidity_score >= 0 and liquidity_score <= 100))
);

drop trigger if exists intent_scores_set_updated_at on public.intent_scores;
create trigger intent_scores_set_updated_at
before update on public.intent_scores
for each row execute function public.set_updated_at();

comment on table public.intent_scores is
'Current KeluScore per token. Written only by workers/intent-engine.js. Read-only for the app.';

comment on column public.intent_scores.marketing_score is
'NULL means no external marketing data has been collected yet. Render as unavailable, never as zero.';

comment on column public.intent_scores.inputs is
'Raw metric values the score was derived from, so a score can always be explained.';

-- ----------------------------------------------------------------------------
-- intent_history - append-only snapshots powering the Timeline chart.
-- ----------------------------------------------------------------------------
create table if not exists public.intent_history (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.tokens(id) on delete cascade,

  kelu_score numeric(6,2) not null,
  grade text,
  conviction_score numeric(6,2),
  momentum_score numeric(6,2),
  breadth_score numeric(6,2),
  performance_score numeric(6,2),
  freshness_score numeric(6,2),
  marketing_score numeric(6,2),
  community_score numeric(6,2),
  liquidity_score numeric(6,2),

  calls_24h integer,
  unique_channels integer,

  captured_at timestamptz not null default timezone('utc', now())
);

comment on table public.intent_history is
'Append-only KeluScore snapshots. One row per token per worker cycle. Drives historical charts.';

-- ----------------------------------------------------------------------------
-- score_changes - material score moves. Phase 3 alerts read from here.
-- ----------------------------------------------------------------------------
create table if not exists public.score_changes (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.tokens(id) on delete cascade,

  previous_score numeric(6,2),
  current_score numeric(6,2) not null,
  delta numeric(6,2) not null,
  direction text not null,

  previous_grade text,
  current_grade text,

  reason text,
  details jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default timezone('utc', now()),

  constraint score_changes_direction_chk check (direction in ('up', 'down'))
);

comment on table public.score_changes is
'Recorded when a KeluScore moves more than the worker threshold. Feeds Phase 3 alerts.';

-- ----------------------------------------------------------------------------
-- project_signals - raw external signals.
--
-- Deliberately generic: (source, signal_type, value). Adding a new provider
-- is a new source string, not a schema change. Kept append-only so a provider
-- outage never destroys previously collected history.
--
-- NOT publicly readable: payload can contain full third-party API responses.
-- ----------------------------------------------------------------------------
create table if not exists public.project_signals (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.tokens(id) on delete cascade,

  source text not null,
  signal_type text not null,

  value_numeric numeric,
  value_text text,
  payload jsonb not null default '{}'::jsonb,

  collected_at timestamptz not null default timezone('utc', now())
);

comment on table public.project_signals is
'Append-only external signals (Dexscreener volume/liquidity, X followers, etc). Service role only.';

comment on column public.project_signals.source is
'Provider key, for example dexscreener or x. Adding a provider does not require a migration.';

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

-- Opportunities leaderboard: top scores first.
create index if not exists intent_scores_leaderboard_idx
  on public.intent_scores (kelu_score desc, computed_at desc);

create index if not exists intent_scores_grade_idx
  on public.intent_scores (grade, kelu_score desc);

create index if not exists intent_scores_computed_idx
  on public.intent_scores (computed_at desc);

create index if not exists intent_history_token_idx
  on public.intent_history (token_id, captured_at desc);

create index if not exists score_changes_token_idx
  on public.score_changes (token_id, created_at desc);

create index if not exists score_changes_recent_idx
  on public.score_changes (created_at desc);

create index if not exists project_signals_lookup_idx
  on public.project_signals (token_id, signal_type, collected_at desc);

create index if not exists project_signals_source_idx
  on public.project_signals (source, collected_at desc);

-- ----------------------------------------------------------------------------
-- Row-level security
--
-- Score data is public product data, same as trending_tokens: anyone may read.
-- Nobody may write except the service role, which bypasses RLS entirely and is
-- only ever used by the worker.
-- ----------------------------------------------------------------------------
alter table public.intent_scores enable row level security;
alter table public.intent_history enable row level security;
alter table public.score_changes enable row level security;
alter table public.project_signals enable row level security;

drop policy if exists intent_scores_public_read on public.intent_scores;
create policy intent_scores_public_read
  on public.intent_scores
  for select
  to anon, authenticated
  using (true);

drop policy if exists intent_history_public_read on public.intent_history;
create policy intent_history_public_read
  on public.intent_history
  for select
  to anon, authenticated
  using (true);

drop policy if exists score_changes_public_read on public.score_changes;
create policy score_changes_public_read
  on public.score_changes
  for select
  to anon, authenticated
  using (true);

-- project_signals intentionally has NO public read policy. RLS is enabled with
-- no permissive policy, so anon and authenticated see nothing at all.

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant select on public.intent_scores to anon, authenticated;
grant select on public.intent_history to anon, authenticated;
grant select on public.score_changes to anon, authenticated;

commit;
