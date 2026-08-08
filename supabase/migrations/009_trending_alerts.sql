begin;

-- ============================================================================
-- Kelucalls alert system, step 1
--
--   1. Adds the token_price_move rule type used by gainers and losers alerts.
--   2. Adds rolling-window trending state so a dispatcher can detect the
--      moment a token STARTS trending.
--
-- Why not just read public.trending_tokens?
--   That materialized view has no time filter. Its total_calls and
--   unique_channels are lifetime counts across every visible call ever made,
--   so it ranks all-time popularity rather than current activity. It also has
--   no history, because refresh materialized view replaces the contents in
--   place, so nothing records when a token entered the list. An alert built
--   on it would fire for tokens that were hot months ago and would then
--   effectively never change again.
--
--   The view is deliberately left untouched. The public trending page and its
--   indexes depend on it. The tables below sit alongside it.
--
-- Postgres note: alter type ... add value is permitted inside a transaction on
-- PG12+, but the new value cannot be USED in that same transaction. Nothing
-- below references token_price_move, so this script is safe to run as one
-- block. If the SQL editor still objects, run the alter type statement on its
-- own first, then run the remainder.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rule type for gainers and losers
--
-- user_alert_rules_target_chk was rewritten in migration 007 with an explicit
-- else true branch, so this new rule type is accepted both with a token target
-- and with no target at all (watchlist-wide).
-- ----------------------------------------------------------------------------
alter type public.alert_rule_type add value if not exists 'token_price_move';

-- ----------------------------------------------------------------------------
-- Current rolling-window trending verdict, one row per token.
--
-- The worker upserts this every cycle. is_trending is the stored verdict, so
-- a transition can be detected by comparing the freshly computed value against
-- the row already here.
-- ----------------------------------------------------------------------------
create table if not exists public.token_trending_state (
  token_id uuid primary key references public.tokens(id) on delete cascade,
  is_trending boolean not null default false,
  unique_channels integer not null default 0,
  total_calls integer not null default 0,
  window_hours integer not null,
  entered_at timestamptz,
  exited_at timestamptz,
  last_evaluated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint token_trending_state_unique_channels_chk check (unique_channels >= 0),
  constraint token_trending_state_total_calls_chk check (total_calls >= 0),
  constraint token_trending_state_window_hours_chk check (window_hours > 0)
);

comment on table public.token_trending_state is
'Rolling-window trending verdict per token, computed from calls over a recent window. Distinct from the lifetime trending_tokens materialized view.';

comment on column public.token_trending_state.entered_at is
'When this token most recently crossed into trending. Null when it has never trended.';

comment on column public.token_trending_state.window_hours is
'The lookback window the verdict was computed over, stored so a row explains itself after the worker config changes.';

drop trigger if exists token_trending_state_set_updated_at on public.token_trending_state;
create trigger token_trending_state_set_updated_at
before update on public.token_trending_state
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trending transitions, one row per crossing.
--
-- Mirrors score_changes so the Phase 3 dispatch pattern applies unchanged:
-- read rows where notified_at is null, fan them out, then stamp them.
--
-- First-run behaviour matters here. token_trending_state starts empty, so a
-- naive first cycle would treat every currently active token as newly entering
-- trending and fan out a large backlog to every subscriber. The worker must
-- seed a token's first state row WITHOUT writing a trending_changes row. Only
-- a stored false to true transition may emit an event. This is the same class
-- of problem migration 007 solved with its notified_at backfill.
-- ----------------------------------------------------------------------------
create table if not exists public.trending_changes (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.tokens(id) on delete cascade,
  direction text not null,
  unique_channels integer not null,
  total_calls integer not null,
  window_hours integer not null,
  details jsonb not null default '{}'::jsonb,
  notified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint trending_changes_direction_chk check (direction in ('entered', 'exited')),
  constraint trending_changes_unique_channels_chk check (unique_channels >= 0),
  constraint trending_changes_total_calls_chk check (total_calls >= 0)
);

comment on table public.trending_changes is
'Append-only trending entry and exit events. notified_at is stamped once the alert dispatcher has fanned the row out.';

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists token_trending_state_trending_idx
  on public.token_trending_state (unique_channels desc, total_calls desc)
  where is_trending;

create index if not exists token_trending_state_evaluated_idx
  on public.token_trending_state (last_evaluated_at desc);

create index if not exists trending_changes_token_idx
  on public.trending_changes (token_id, created_at desc);

create index if not exists trending_changes_pending_idx
  on public.trending_changes (created_at)
  where notified_at is null;

-- ----------------------------------------------------------------------------
-- Row-level security
--
-- Application and worker access both run through the service role, which
-- bypasses RLS. token_trending_state still carries a public read policy
-- because it is a public-safe aggregate that a future trending-now surface
-- may want to read directly. trending_changes is dispatch bookkeeping and
-- stays internal, matching how project_signals is treated in migration 006.
-- ----------------------------------------------------------------------------
alter table public.token_trending_state enable row level security;
alter table public.trending_changes enable row level security;

drop policy if exists token_trending_state_public_read on public.token_trending_state;
create policy token_trending_state_public_read
  on public.token_trending_state
  for select
  to anon, authenticated
  using (true);

grant select on public.token_trending_state to anon, authenticated;

commit;
