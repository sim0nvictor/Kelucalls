-- ============================================================
-- Migration: 20260507_trending_snapshots_and_rls_hardening.sql
-- Purpose:   Adds trending_snapshots table + write-denial RLS
-- Safe:      Fully idempotent — uses IF NOT EXISTS / IF EXISTS
-- ============================================================

-- --------------------------------------------------------
-- 1. Trending Snapshots table (point-in-time captures)
-- --------------------------------------------------------
create table if not exists public.trending_snapshots (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.tokens(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_calls integer not null default 0,
  unique_channels integer not null default 0,
  average_roi_pct numeric(12, 4) not null default 0,
  best_multiple numeric(18, 6) not null default 1,
  last_called_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint trending_snapshots_token_date_unique unique (token_id, snapshot_date)
);

create index if not exists trending_snapshots_date_idx
  on public.trending_snapshots(snapshot_date desc);

create index if not exists trending_snapshots_token_idx
  on public.trending_snapshots(token_id, snapshot_date desc);

-- Enable RLS
alter table public.trending_snapshots enable row level security;

-- Public read access
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'trending_snapshots' and policyname = 'public read trending snapshots'
  ) then
    create policy "public read trending snapshots" on public.trending_snapshots
      for select using (true);
  end if;
end $$;

-- --------------------------------------------------------
-- 2. Write-denial RLS policies for anon role
--    These prevent anonymous users from INSERT/UPDATE/DELETE
--    on tables that should be server-write-only.
--    Service role key bypasses RLS, so server operations
--    are unaffected.
-- --------------------------------------------------------

-- channels: deny anon writes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'channels' and policyname = 'deny anon insert channels'
  ) then
    create policy "deny anon insert channels" on public.channels
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'channels' and policyname = 'deny anon update channels'
  ) then
    create policy "deny anon update channels" on public.channels
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'channels' and policyname = 'deny anon delete channels'
  ) then
    create policy "deny anon delete channels" on public.channels
      for delete to anon using (false);
  end if;
end $$;

-- tokens: deny anon writes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tokens' and policyname = 'deny anon insert tokens'
  ) then
    create policy "deny anon insert tokens" on public.tokens
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'tokens' and policyname = 'deny anon update tokens'
  ) then
    create policy "deny anon update tokens" on public.tokens
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'tokens' and policyname = 'deny anon delete tokens'
  ) then
    create policy "deny anon delete tokens" on public.tokens
      for delete to anon using (false);
  end if;
end $$;

-- calls: deny anon writes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'calls' and policyname = 'deny anon insert calls'
  ) then
    create policy "deny anon insert calls" on public.calls
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'calls' and policyname = 'deny anon update calls'
  ) then
    create policy "deny anon update calls" on public.calls
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'calls' and policyname = 'deny anon delete calls'
  ) then
    create policy "deny anon delete calls" on public.calls
      for delete to anon using (false);
  end if;
end $$;

-- call_metrics: deny anon writes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'call_metrics' and policyname = 'deny anon insert call_metrics'
  ) then
    create policy "deny anon insert call_metrics" on public.call_metrics
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'call_metrics' and policyname = 'deny anon update call_metrics'
  ) then
    create policy "deny anon update call_metrics" on public.call_metrics
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'call_metrics' and policyname = 'deny anon delete call_metrics'
  ) then
    create policy "deny anon delete call_metrics" on public.call_metrics
      for delete to anon using (false);
  end if;
end $$;

-- channel_stats: deny anon writes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'channel_stats' and policyname = 'deny anon insert channel_stats'
  ) then
    create policy "deny anon insert channel_stats" on public.channel_stats
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'channel_stats' and policyname = 'deny anon update channel_stats'
  ) then
    create policy "deny anon update channel_stats" on public.channel_stats
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'channel_stats' and policyname = 'deny anon delete channel_stats'
  ) then
    create policy "deny anon delete channel_stats" on public.channel_stats
      for delete to anon using (false);
  end if;
end $$;

-- trending_snapshots: deny anon writes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'trending_snapshots' and policyname = 'deny anon insert trending_snapshots'
  ) then
    create policy "deny anon insert trending_snapshots" on public.trending_snapshots
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'trending_snapshots' and policyname = 'deny anon update trending_snapshots'
  ) then
    create policy "deny anon update trending_snapshots" on public.trending_snapshots
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'trending_snapshots' and policyname = 'deny anon delete trending_snapshots'
  ) then
    create policy "deny anon delete trending_snapshots" on public.trending_snapshots
      for delete to anon using (false);
  end if;
end $$;

-- submissions: deny anon update/delete (insert already allowed)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'submissions' and policyname = 'deny anon update submissions'
  ) then
    create policy "deny anon update submissions" on public.submissions
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'submissions' and policyname = 'deny anon delete submissions'
  ) then
    create policy "deny anon delete submissions" on public.submissions
      for delete to anon using (false);
  end if;
end $$;

-- ads: deny anon writes
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'ads' and policyname = 'deny anon insert ads'
  ) then
    create policy "deny anon insert ads" on public.ads
      for insert to anon with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'ads' and policyname = 'deny anon update ads'
  ) then
    create policy "deny anon update ads" on public.ads
      for update to anon using (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'ads' and policyname = 'deny anon delete ads'
  ) then
    create policy "deny anon delete ads" on public.ads
      for delete to anon using (false);
  end if;
end $$;
