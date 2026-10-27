begin;

-- ============================================================================
-- Migration: 020_token_price_observations.sql
-- Purpose:  Adds a reusable historical price observation layer for future
--           fixed-horizon analytics without duplicating call-level ROI columns.
--
-- Design principle:
--   - Store raw observations, not precomputed fixed-horizon ROI values.
--   - Prefer token-level snapshots because many calls can share the same token
--     and the same price observation should not be duplicated at every call.
--   - New observations begin at deployment time; existing calls are not backfilled
--     because the project cannot safely fabricate historical price data.
-- ============================================================================

create table if not exists public.token_price_observations (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.tokens(id) on delete cascade,
  price_usd numeric(24, 12) not null check (price_usd > 0),
  market_cap_usd numeric(24, 2),
  observed_at timestamptz not null,
  source text not null default 'dexscreener',
  created_at timestamptz not null default timezone('utc', now()),
  constraint token_price_observations_token_observed_unique unique (token_id, observed_at)
);

create index if not exists token_price_observations_token_time_idx
  on public.token_price_observations (token_id, observed_at desc);

create index if not exists token_price_observations_observed_at_idx
  on public.token_price_observations (observed_at desc);

comment on table public.token_price_observations is
'Raw token-price snapshots captured for future fixed-horizon analytics. This table stores the source observations; fixed-horizon ROI and win-rate windows should be derived from this table instead of storing many duplicate ROI columns.';

comment on column public.token_price_observations.token_id is
'Token being observed. Chosen over call_id because multiple calls can legitimately share the same token price at the same historical moment.';

comment on column public.token_price_observations.price_usd is
'The live token price from the source provider at observed_at. All future horizon analytics should derive from these raw observations.';

comment on column public.token_price_observations.source is
'Provider/source label for the observation (for example: dexscreener).';

alter table public.token_price_observations enable row level security;

-- Public read: these are non-sensitive market observations and will be read by
-- future analytics/UI code once the historical measurement layer is enabled.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'token_price_observations' and policyname = 'public read token price observations'
  ) then
    create policy "public read token price observations"
      on public.token_price_observations
      for select to public
      using (true);
  end if;
end $$;

-- Do not allow anon clients to write raw observation data.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'token_price_observations' and policyname = 'deny anon insert token price observations'
  ) then
    create policy "deny anon insert token price observations"
      on public.token_price_observations
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'token_price_observations' and policyname = 'deny anon update token price observations'
  ) then
    create policy "deny anon update token price observations"
      on public.token_price_observations
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'token_price_observations' and policyname = 'deny anon delete token price observations'
  ) then
    create policy "deny anon delete token price observations"
      on public.token_price_observations
      for delete to anon using (false);
  end if;
end $$;

commit;
