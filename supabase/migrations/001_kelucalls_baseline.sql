begin;

-- ============================================================================
-- Kelucalls baseline reset
-- Rebuilds the public schema into clear source, intelligence, analytics,
-- monetization, and community layers without SECURITY DEFINER views/functions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- Safe reset of drifted public objects
-- ----------------------------------------------------------------------------
drop materialized view if exists public.trending_tokens cascade;
drop view if exists public.trending_tokens cascade;
drop function if exists public.refresh_public_analytics() cascade;
drop function if exists public.refresh_trending_tokens() cascade;
drop function if exists public.refresh_channel_stats(uuid) cascade;
drop function if exists public.set_updated_at() cascade;

drop table if exists public.worker_runs cascade;
drop table if exists public.admin_audit_logs cascade;
drop table if exists public.moderation_reports cascade;
drop table if exists public.ad_clicks cascade;
drop table if exists public.ad_impressions cascade;
drop table if exists public.sponsored_placements cascade;
drop table if exists public.ads cascade;
drop table if exists public.submissions cascade;
drop table if exists public.channel_stats cascade;
drop table if exists public.call_metrics cascade;
drop table if exists public.calls cascade;
drop table if exists public.telegram_messages cascade;
drop table if exists public.tokens cascade;
drop table if exists public.channels cascade;
drop table if exists public.admin_users cascade;
drop table if exists public.trending_snapshots cascade;

drop type if exists public.worker_status cascade;
drop type if exists public.admin_role cascade;
drop type if exists public.ad_placement cascade;
drop type if exists public.ad_status cascade;
drop type if exists public.submission_status cascade;
drop type if exists public.call_status cascade;
drop type if exists public.token_status cascade;
drop type if exists public.channel_status cascade;
drop type if exists public.blockchain cascade;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.blockchain as enum (
  'solana',
  'ethereum',
  'bsc',
  'base',
  'arbitrum',
  'polygon',
  'avalanche',
  'sui',
  'tron',
  'other'
);

create type public.channel_status as enum ('pending', 'active', 'paused', 'archived');
create type public.token_status as enum ('active', 'inactive', 'archived');
create type public.call_status as enum ('open', 'closed', 'invalid', 'hidden');
create type public.submission_status as enum ('pending', 'approved', 'rejected');
create type public.ad_status as enum ('draft', 'active', 'paused', 'expired');
create type public.ad_placement as enum ('homepage', 'channels', 'live_feed', 'tokens', 'channel_detail');
create type public.admin_role as enum ('super_admin', 'admin', 'analyst', 'moderator');
create type public.worker_status as enum ('queued', 'running', 'succeeded', 'failed');

-- ----------------------------------------------------------------------------
-- Shared trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

comment on function public.set_updated_at() is
'Generic updated_at trigger used by mutable application tables.';

-- ----------------------------------------------------------------------------
-- Admin and control layer
-- ----------------------------------------------------------------------------
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext unique,
  full_name text,
  role public.admin_role not null default 'admin',
  is_active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_users_email_chk check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

comment on table public.admin_users is
'Explicit allowlist for the hidden Kelucalls admin system.';

-- ----------------------------------------------------------------------------
-- Source layer
-- Raw Telegram ingestion data. This is internal-only and optimized for
-- idempotent scraper writes plus downstream parser workers.
-- ----------------------------------------------------------------------------
create table public.channels (
  id uuid primary key default gen_random_uuid(),
  slug citext not null,
  telegram_handle citext not null,
  telegram_handle_normalized text generated always as (
    lower(replace(btrim(telegram_handle::text), '@', ''))
  ) stored,
  telegram_url text not null,
  telegram_peer_id bigint,
  title text not null,
  description text,
  avatar_url text,
  status public.channel_status not null default 'pending',
  is_paid_channel boolean not null default false,
  is_verified boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  last_scraped_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint channels_slug_key unique (slug),
  constraint channels_telegram_handle_key unique (telegram_handle_normalized),
  constraint channels_telegram_url_key unique (telegram_url),
  constraint channels_telegram_peer_id_key unique (telegram_peer_id),
  constraint channels_slug_chk check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint channels_telegram_url_chk check (telegram_url ~* '^https?://'),
  constraint channels_avatar_url_chk check (avatar_url is null or avatar_url ~* '^https?://')
);

create trigger channels_set_updated_at
before update on public.channels
for each row execute function public.set_updated_at();

comment on table public.channels is
'Tracked Telegram channels. Publicly readable when active/paused, writable only via service role/admin workflows.';

create table public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  telegram_message_id bigint not null,
  telegram_grouped_id bigint,
  message_date timestamptz not null,
  edited_at timestamptz,
  raw_text text not null default '',
  raw_payload jsonb not null default '{}'::jsonb,
  scrape_metadata jsonb not null default '{}'::jsonb,
  scraped_at timestamptz not null default timezone('utc', now()),
  parsed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint telegram_messages_channel_message_key unique (channel_id, telegram_message_id)
);

comment on table public.telegram_messages is
'Immutable raw Telegram messages retained for parser replay, auditability, and ingestion debugging.';

-- ----------------------------------------------------------------------------
-- Intelligence layer
-- Parsed entities and call performance records.
-- ----------------------------------------------------------------------------
create table public.tokens (
  id uuid primary key default gen_random_uuid(),
  slug citext not null,
  symbol citext not null,
  symbol_normalized text generated always as (upper(btrim(symbol::text))) stored,
  name text,
  description text,
  logo_url text,
  chain public.blockchain not null default 'solana',
  status public.token_status not null default 'active',
  contract_address text,
  contract_address_normalized text generated always as (
    nullif(lower(btrim(contract_address)), '')
  ) stored,
  website_url text,
  coingecko_id text,
  dexscreener_pair_id text,
  last_price_usd numeric(24, 12),
  last_market_cap_usd numeric(24, 2),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tokens_slug_key unique (slug),
  constraint tokens_chain_symbol_key unique (chain, symbol_normalized),
  constraint tokens_chain_contract_key unique nulls not distinct (chain, contract_address_normalized),
  constraint tokens_coingecko_id_key unique (coingecko_id),
  constraint tokens_dexscreener_pair_id_key unique (dexscreener_pair_id),
  constraint tokens_slug_chk check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tokens_logo_url_chk check (logo_url is null or logo_url ~* '^https?://'),
  constraint tokens_website_url_chk check (website_url is null or website_url ~* '^https?://'),
  constraint tokens_last_price_usd_chk check (last_price_usd is null or last_price_usd >= 0),
  constraint tokens_last_market_cap_usd_chk check (last_market_cap_usd is null or last_market_cap_usd >= 0)
);

create trigger tokens_set_updated_at
before update on public.tokens
for each row execute function public.set_updated_at();

comment on table public.tokens is
'Normalized token registry spanning multiple chains. Used by calls, ROI workers, and public analytics.';

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  token_id uuid not null references public.tokens(id) on delete restrict,
  source_message_id uuid references public.telegram_messages(id) on delete set null,
  telegram_message_id bigint,
  message_text text not null,
  called_at timestamptz not null,
  detected_symbol citext,
  detected_contract_address text,
  detected_contract_address_normalized text generated always as (
    nullif(lower(btrim(detected_contract_address)), '')
  ) stored,
  entry_price_usd numeric(24, 12),
  entry_market_cap_usd numeric(24, 2),
  confidence_score numeric(5, 4) not null default 0.5000,
  status public.call_status not null default 'open',
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint calls_channel_message_token_key unique nulls not distinct (channel_id, telegram_message_id, token_id),
  constraint calls_confidence_score_chk check (confidence_score >= 0 and confidence_score <= 1),
  constraint calls_entry_price_usd_chk check (entry_price_usd is null or entry_price_usd >= 0),
  constraint calls_entry_market_cap_usd_chk check (entry_market_cap_usd is null or entry_market_cap_usd >= 0)
);

create trigger calls_set_updated_at
before update on public.calls
for each row execute function public.set_updated_at();

comment on table public.calls is
'Canonical token-call events parsed from telegram_messages. Public reads use this table, workers write through service role.';

create table public.call_metrics (
  call_id uuid primary key references public.calls(id) on delete cascade,
  current_price_usd numeric(24, 12),
  current_market_cap_usd numeric(24, 2),
  peak_price_usd numeric(24, 12),
  peak_market_cap_usd numeric(24, 2),
  current_roi_pct numeric(12, 4) not null default 0,
  peak_roi_pct numeric(12, 4) not null default 0,
  current_multiple numeric(18, 6) not null default 1,
  peak_multiple numeric(18, 6) not null default 1,
  is_win boolean not null default false,
  hit_2x boolean not null default false,
  hit_5x boolean not null default false,
  hit_10x boolean not null default false,
  hit_50x boolean not null default false,
  hit_100x boolean not null default false,
  simulated_investment_usd numeric(12, 2) not null default 10,
  simulated_current_value_usd numeric(16, 4) not null default 10,
  simulated_peak_value_usd numeric(16, 4) not null default 10,
  simulated_current_pnl_usd numeric(16, 4) not null default 0,
  simulated_peak_pnl_usd numeric(16, 4) not null default 0,
  refreshed_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint call_metrics_current_price_usd_chk check (current_price_usd is null or current_price_usd >= 0),
  constraint call_metrics_current_market_cap_usd_chk check (current_market_cap_usd is null or current_market_cap_usd >= 0),
  constraint call_metrics_peak_price_usd_chk check (peak_price_usd is null or peak_price_usd >= 0),
  constraint call_metrics_peak_market_cap_usd_chk check (peak_market_cap_usd is null or peak_market_cap_usd >= 0),
  constraint call_metrics_current_multiple_chk check (current_multiple >= 0),
  constraint call_metrics_peak_multiple_chk check (peak_multiple >= 0),
  constraint call_metrics_simulated_investment_usd_chk check (simulated_investment_usd > 0)
);

create trigger call_metrics_set_updated_at
before update on public.call_metrics
for each row execute function public.set_updated_at();

comment on table public.call_metrics is
'Derived ROI, breakout, and PnL metrics refreshed by background workers.';

-- ----------------------------------------------------------------------------
-- Analytics layer
-- channel_stats remains a table so PostgREST relationships to channels remain
-- stable for the current frontend. trending_tokens is a materialized view
-- because it is read-heavy and only contains already-public safe aggregates.
-- ----------------------------------------------------------------------------
create table public.channel_stats (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  total_calls integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  win_rate_pct numeric(12, 4) not null default 0,
  average_roi_pct numeric(12, 4) not null default 0,
  median_roi_pct numeric(12, 4) not null default 0,
  average_peak_roi_pct numeric(12, 4) not null default 0,
  average_multiple numeric(18, 6) not null default 1,
  best_multiple numeric(18, 6) not null default 1,
  hit_2x_count integer not null default 0,
  hit_5x_count integer not null default 0,
  hit_10x_count integer not null default 0,
  hit_50x_count integer not null default 0,
  hit_100x_count integer not null default 0,
  simulated_investment_usd numeric(16, 4) not null default 0,
  simulated_current_value_usd numeric(16, 4) not null default 0,
  simulated_peak_value_usd numeric(16, 4) not null default 0,
  simulated_current_pnl_usd numeric(16, 4) not null default 0,
  simulated_peak_pnl_usd numeric(16, 4) not null default 0,
  ranking_score numeric(18, 6) not null default 0,
  last_call_at timestamptz,
  refreshed_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint channel_stats_total_calls_chk check (total_calls >= 0),
  constraint channel_stats_wins_chk check (wins >= 0),
  constraint channel_stats_losses_chk check (losses >= 0)
);

create trigger channel_stats_set_updated_at
before update on public.channel_stats
for each row execute function public.set_updated_at();

comment on table public.channel_stats is
'Precomputed channel leaderboard aggregates refreshed from visible calls.';

-- ----------------------------------------------------------------------------
-- Monetization and community layers
-- ----------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  telegram_handle citext not null,
  telegram_url text,
  channel_name text not null,
  description text,
  submitter_contact text,
  fast_track_requested boolean not null default false,
  status public.submission_status not null default 'pending',
  review_notes text,
  approved_channel_id uuid references public.channels(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint submissions_telegram_url_chk check (telegram_url is null or telegram_url ~* '^https?://')
);

create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

comment on table public.submissions is
'Public intake queue for channel suggestions. Only service role/admin workflows may review rows.';

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  label text not null,
  placement public.ad_placement not null,
  destination_url text not null,
  creative_copy text,
  image_url text,
  image_path text,
  image_alt text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  priority integer not null default 100,
  status public.ad_status not null default 'draft',
  budget_usd numeric(12, 2),
  metadata jsonb not null default '{}'::jsonb,
  impression_tracking_enabled boolean not null default true,
  click_tracking_enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ads_destination_url_chk check (destination_url ~* '^https?://'),
  constraint ads_image_url_chk check (image_url is null or image_url ~* '^https?://'),
  constraint ads_budget_usd_chk check (budget_usd is null or budget_usd >= 0),
  constraint ads_priority_chk check (priority >= 0),
  constraint ads_ends_at_chk check (ends_at is null or ends_at > starts_at)
);

create trigger ads_set_updated_at
before update on public.ads
for each row execute function public.set_updated_at();

comment on table public.ads is
'Public sponsored placements shown in the current frontend surfaces.';

create table public.sponsored_placements (
  id uuid primary key default gen_random_uuid(),
  token_id uuid references public.tokens(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  title text not null,
  subtitle text,
  destination_url text not null,
  surface text not null,
  placement_type text not null,
  slot_key text not null,
  image_url text,
  badge_label text,
  priority integer not null default 100,
  status public.ad_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint sponsored_placements_destination_url_chk check (destination_url ~* '^https?://'),
  constraint sponsored_placements_image_url_chk check (image_url is null or image_url ~* '^https?://'),
  constraint sponsored_placements_surface_chk check (surface in ('homepage', 'trending', 'tokens', 'live_feed')),
  constraint sponsored_placements_type_chk check (placement_type in ('featured_token', 'project_spotlight', 'homepage_slot', 'trending_boost')),
  constraint sponsored_placements_priority_chk check (priority >= 0),
  constraint sponsored_placements_target_chk check (token_id is not null or channel_id is not null),
  constraint sponsored_placements_ends_at_chk check (ends_at is null or ends_at > starts_at)
);

create trigger sponsored_placements_set_updated_at
before update on public.sponsored_placements
for each row execute function public.set_updated_at();

create table public.ad_impressions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references public.ads(id) on delete cascade,
  sponsored_placement_id uuid references public.sponsored_placements(id) on delete cascade,
  occurred_at timestamptz not null default timezone('utc', now()),
  page_path text,
  referrer text,
  session_id text,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  constraint ad_impressions_target_chk check (
    (ad_id is not null and sponsored_placement_id is null)
    or (ad_id is null and sponsored_placement_id is not null)
  )
);

create table public.ad_clicks (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references public.ads(id) on delete cascade,
  sponsored_placement_id uuid references public.sponsored_placements(id) on delete cascade,
  occurred_at timestamptz not null default timezone('utc', now()),
  page_path text,
  referrer text,
  session_id text,
  ip_hash text,
  user_agent text,
  destination_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint ad_clicks_target_chk check (
    (ad_id is not null and sponsored_placement_id is null)
    or (ad_id is null and sponsored_placement_id is not null)
  ),
  constraint ad_clicks_destination_url_chk check (destination_url ~* '^https?://')
);

create table public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  token_id uuid references public.tokens(id) on delete set null,
  report_type text not null,
  reason text not null,
  details text,
  reporter_email text,
  status text not null default 'open',
  resolution_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint moderation_reports_status_chk check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint moderation_reports_target_chk check (
    submission_id is not null or channel_id is not null or token_id is not null
  )
);

create trigger moderation_reports_set_updated_at
before update on public.moderation_reports
for each row execute function public.set_updated_at();

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.worker_runs (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null,
  status public.worker_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.worker_runs is
'Internal job observability table for ingestion, analytics, and pricing workers.';

-- ----------------------------------------------------------------------------
-- Indexes for ingestion, leaderboards, trending, and admin workflows
-- ----------------------------------------------------------------------------
create index channels_public_list_idx
  on public.channels (status, is_verified desc, title, created_at desc)
  where status in ('active', 'paused');

create index channels_last_scraped_idx
  on public.channels (last_scraped_at desc nulls last);

create index channels_paid_status_idx
  on public.channels (is_paid_channel, status);

create index telegram_messages_channel_date_idx
  on public.telegram_messages (channel_id, message_date desc);

create index telegram_messages_scraped_idx
  on public.telegram_messages (scraped_at desc);

create index telegram_messages_raw_payload_gin
  on public.telegram_messages using gin (raw_payload);

create index tokens_public_lookup_idx
  on public.tokens (status, chain, symbol_normalized);

create index tokens_last_seen_idx
  on public.tokens (last_seen_at desc nulls last);

create index tokens_contract_lookup_idx
  on public.tokens (chain, contract_address_normalized)
  where contract_address_normalized is not null;

create index calls_live_feed_idx
  on public.calls (called_at desc)
  where status in ('open', 'closed');

create index calls_channel_recent_idx
  on public.calls (channel_id, called_at desc)
  where status in ('open', 'closed');

create index calls_token_recent_idx
  on public.calls (token_id, called_at desc)
  where status in ('open', 'closed');

create index calls_source_message_idx
  on public.calls (source_message_id);

create index calls_detected_contract_idx
  on public.calls (detected_contract_address_normalized)
  where detected_contract_address_normalized is not null;

create index call_metrics_roi_idx
  on public.call_metrics (current_roi_pct desc);

create index call_metrics_peak_multiple_idx
  on public.call_metrics (peak_multiple desc);

create index channel_stats_ranking_idx
  on public.channel_stats (ranking_score desc);

create index channel_stats_pnl_idx
  on public.channel_stats (simulated_current_pnl_usd desc);

create index channel_stats_last_call_idx
  on public.channel_stats (last_call_at desc nulls last);

create index submissions_status_created_at_idx
  on public.submissions (status, created_at desc);

create index ads_public_schedule_idx
  on public.ads (placement, priority asc, starts_at desc)
  where status = 'active';

create index ads_channel_schedule_idx
  on public.ads (channel_id, starts_at desc);

create index sponsored_placements_surface_schedule_idx
  on public.sponsored_placements (surface, status, priority asc, starts_at desc);

create index sponsored_placements_token_idx
  on public.sponsored_placements (token_id, starts_at desc)
  where token_id is not null;

create index sponsored_placements_channel_idx
  on public.sponsored_placements (channel_id, starts_at desc)
  where channel_id is not null;

create index ad_impressions_ad_occurred_idx
  on public.ad_impressions (ad_id, occurred_at desc)
  where ad_id is not null;

create index ad_impressions_placement_occurred_idx
  on public.ad_impressions (sponsored_placement_id, occurred_at desc)
  where sponsored_placement_id is not null;

create index ad_clicks_ad_occurred_idx
  on public.ad_clicks (ad_id, occurred_at desc)
  where ad_id is not null;

create index ad_clicks_placement_occurred_idx
  on public.ad_clicks (sponsored_placement_id, occurred_at desc)
  where sponsored_placement_id is not null;

create index moderation_reports_status_created_at_idx
  on public.moderation_reports (status, created_at desc);

create index admin_audit_logs_admin_created_at_idx
  on public.admin_audit_logs (admin_user_id, created_at desc);

create index admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity_type, entity_id, created_at desc);

create index worker_runs_name_status_idx
  on public.worker_runs (worker_name, status, created_at desc);

-- ----------------------------------------------------------------------------
-- Analytics refresh functions
-- SECURITY INVOKER by default. Intended for service-role workers or direct SQL.
-- ----------------------------------------------------------------------------
create or replace function public.refresh_channel_stats(target_channel_id uuid default null)
returns void
language plpgsql
as $$
begin
  insert into public.channel_stats (
    channel_id,
    total_calls,
    wins,
    losses,
    win_rate_pct,
    average_roi_pct,
    median_roi_pct,
    average_peak_roi_pct,
    average_multiple,
    best_multiple,
    hit_2x_count,
    hit_5x_count,
    hit_10x_count,
    hit_50x_count,
    hit_100x_count,
    simulated_investment_usd,
    simulated_current_value_usd,
    simulated_peak_value_usd,
    simulated_current_pnl_usd,
    simulated_peak_pnl_usd,
    ranking_score,
    last_call_at,
    refreshed_at
  )
  select
    ch.id as channel_id,
    count(c.id)::integer as total_calls,
    count(c.id) filter (where cm.is_win)::integer as wins,
    count(c.id) filter (where cm.call_id is not null and not cm.is_win)::integer as losses,
    coalesce(avg(case when cm.is_win then 100 else 0 end), 0)::numeric(12, 4) as win_rate_pct,
    coalesce(avg(cm.current_roi_pct), 0)::numeric(12, 4) as average_roi_pct,
    coalesce(percentile_cont(0.5) within group (order by cm.current_roi_pct), 0)::numeric(12, 4) as median_roi_pct,
    coalesce(avg(cm.peak_roi_pct), 0)::numeric(12, 4) as average_peak_roi_pct,
    coalesce(avg(cm.current_multiple), 1)::numeric(18, 6) as average_multiple,
    coalesce(max(cm.peak_multiple), 1)::numeric(18, 6) as best_multiple,
    count(c.id) filter (where cm.hit_2x)::integer as hit_2x_count,
    count(c.id) filter (where cm.hit_5x)::integer as hit_5x_count,
    count(c.id) filter (where cm.hit_10x)::integer as hit_10x_count,
    count(c.id) filter (where cm.hit_50x)::integer as hit_50x_count,
    count(c.id) filter (where cm.hit_100x)::integer as hit_100x_count,
    coalesce(sum(cm.simulated_investment_usd), 0)::numeric(16, 4) as simulated_investment_usd,
    coalesce(sum(cm.simulated_current_value_usd), 0)::numeric(16, 4) as simulated_current_value_usd,
    coalesce(sum(cm.simulated_peak_value_usd), 0)::numeric(16, 4) as simulated_peak_value_usd,
    coalesce(sum(cm.simulated_current_pnl_usd), 0)::numeric(16, 4) as simulated_current_pnl_usd,
    coalesce(sum(cm.simulated_peak_pnl_usd), 0)::numeric(16, 4) as simulated_peak_pnl_usd,
    (
      case
        when ch.is_paid_channel then 0
        when count(c.id) = 0 then 0
        else
          coalesce(avg(cm.current_roi_pct), 0) * 0.5 +
          coalesce(avg(case when cm.is_win then 100 else 0 end), 0) * 0.3 +
          ln(count(c.id) + 1) * 0.2
      end
    )::numeric(18, 6) as ranking_score,
    max(c.called_at) as last_call_at,
    timezone('utc', now()) as refreshed_at
  from public.channels ch
  left join public.calls c
    on c.channel_id = ch.id
   and c.status in ('open', 'closed')
  left join public.call_metrics cm
    on cm.call_id = c.id
  where ch.status in ('active', 'paused')
    and (target_channel_id is null or ch.id = target_channel_id)
  group by ch.id, ch.is_paid_channel
  on conflict (channel_id) do update set
    total_calls = excluded.total_calls,
    wins = excluded.wins,
    losses = excluded.losses,
    win_rate_pct = excluded.win_rate_pct,
    average_roi_pct = excluded.average_roi_pct,
    median_roi_pct = excluded.median_roi_pct,
    average_peak_roi_pct = excluded.average_peak_roi_pct,
    average_multiple = excluded.average_multiple,
    best_multiple = excluded.best_multiple,
    hit_2x_count = excluded.hit_2x_count,
    hit_5x_count = excluded.hit_5x_count,
    hit_10x_count = excluded.hit_10x_count,
    hit_50x_count = excluded.hit_50x_count,
    hit_100x_count = excluded.hit_100x_count,
    simulated_investment_usd = excluded.simulated_investment_usd,
    simulated_current_value_usd = excluded.simulated_current_value_usd,
    simulated_peak_value_usd = excluded.simulated_peak_value_usd,
    simulated_current_pnl_usd = excluded.simulated_current_pnl_usd,
    simulated_peak_pnl_usd = excluded.simulated_peak_pnl_usd,
    ranking_score = excluded.ranking_score,
    last_call_at = excluded.last_call_at,
    refreshed_at = excluded.refreshed_at;

  delete from public.channel_stats cs
  where (target_channel_id is null or cs.channel_id = target_channel_id)
    and not exists (
      select 1
      from public.channels ch
      where ch.id = cs.channel_id
        and ch.status in ('active', 'paused')
    );
end;
$$;

comment on function public.refresh_channel_stats(uuid) is
'Recomputes public channel leaderboard stats from visible calls and call_metrics.';

create materialized view public.trending_tokens as
select
  t.id,
  t.symbol::text as symbol,
  t.name,
  t.description,
  t.logo_url,
  t.chain,
  t.contract_address,
  count(c.id)::integer as total_calls,
  count(distinct c.channel_id)::integer as unique_channels,
  max(c.called_at) as last_called_at,
  coalesce(avg(cm.current_roi_pct), 0)::numeric(12, 4) as average_roi_pct,
  coalesce(max(cm.peak_multiple), 1)::numeric(18, 6) as best_multiple
from public.tokens t
join public.calls c
  on c.token_id = t.id
 and c.status in ('open', 'closed')
join public.channels ch
  on ch.id = c.channel_id
 and ch.status in ('active', 'paused')
left join public.call_metrics cm
  on cm.call_id = c.id
where t.status = 'active'
group by t.id, t.symbol, t.name, t.description, t.logo_url, t.chain, t.contract_address;

comment on materialized view public.trending_tokens is
'Public-safe aggregate of trending tokens. No raw messages or internal-only rows are exposed.';

create unique index trending_tokens_id_idx
  on public.trending_tokens (id);

create index trending_tokens_rank_idx
  on public.trending_tokens (unique_channels desc, total_calls desc, last_called_at desc);

create index trending_tokens_chain_idx
  on public.trending_tokens (chain, unique_channels desc, total_calls desc);

create or replace function public.refresh_trending_tokens()
returns void
language plpgsql
as $$
begin
  refresh materialized view public.trending_tokens;
end;
$$;

comment on function public.refresh_trending_tokens() is
'Refreshes the public.trending_tokens materialized view. Use direct SQL CONCURRENTLY outside a transaction when needed.';

create or replace function public.refresh_public_analytics()
returns void
language plpgsql
as $$
begin
  perform public.refresh_channel_stats(null);
  perform public.refresh_trending_tokens();
end;
$$;

comment on function public.refresh_public_analytics() is
'Convenience wrapper for workers to refresh channel_stats then trending_tokens.';

-- ----------------------------------------------------------------------------
-- Row-level security
-- ----------------------------------------------------------------------------
alter table public.admin_users enable row level security;
alter table public.channels enable row level security;
alter table public.telegram_messages enable row level security;
alter table public.tokens enable row level security;
alter table public.calls enable row level security;
alter table public.call_metrics enable row level security;
alter table public.channel_stats enable row level security;
alter table public.submissions enable row level security;
alter table public.ads enable row level security;
alter table public.sponsored_placements enable row level security;
alter table public.ad_impressions enable row level security;
alter table public.ad_clicks enable row level security;
alter table public.moderation_reports enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.worker_runs enable row level security;

-- admin_users: authenticated users may see their own active row only.
create policy admin_users_self_select
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid() and is_active = true);

-- channels
create policy channels_public_read
  on public.channels
  for select
  to anon, authenticated
  using (status in ('active', 'paused'));

create policy channels_admin_write
  on public.channels
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- telegram_messages: internal only
create policy telegram_messages_admin_read
  on public.telegram_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- tokens
create policy tokens_public_read
  on public.tokens
  for select
  to anon, authenticated
  using (status = 'active');

create policy tokens_admin_write
  on public.tokens
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- calls
create policy calls_public_read
  on public.calls
  for select
  to anon, authenticated
  using (
    status in ('open', 'closed')
    and exists (
      select 1
      from public.channels ch
      where ch.id = calls.channel_id
        and ch.status in ('active', 'paused')
    )
    and exists (
      select 1
      from public.tokens t
      where t.id = calls.token_id
        and t.status = 'active'
    )
  );

create policy calls_admin_write
  on public.calls
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- call_metrics
create policy call_metrics_public_read
  on public.call_metrics
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.calls c
      join public.channels ch on ch.id = c.channel_id
      join public.tokens t on t.id = c.token_id
      where c.id = call_metrics.call_id
        and c.status in ('open', 'closed')
        and ch.status in ('active', 'paused')
        and t.status = 'active'
    )
  );

create policy call_metrics_admin_write
  on public.call_metrics
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- channel_stats
create policy channel_stats_public_read
  on public.channel_stats
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.channels ch
      where ch.id = channel_stats.channel_id
        and ch.status in ('active', 'paused')
    )
  );

create policy channel_stats_admin_write
  on public.channel_stats
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- submissions
create policy submissions_public_insert
  on public.submissions
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and approved_channel_id is null
    and review_notes is null
  );

create policy submissions_admin_read_write
  on public.submissions
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- ads
create policy ads_public_read
  on public.ads
  for select
  to anon, authenticated
  using (
    status = 'active'
    and starts_at <= timezone('utc', now())
    and (ends_at is null or ends_at > timezone('utc', now()))
    and exists (
      select 1
      from public.channels ch
      where ch.id = ads.channel_id
        and ch.status in ('active', 'paused')
    )
  );

create policy ads_admin_write
  on public.ads
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- sponsored placements
create policy sponsored_placements_public_read
  on public.sponsored_placements
  for select
  to anon, authenticated
  using (
    status = 'active'
    and starts_at <= timezone('utc', now())
    and (ends_at is null or ends_at > timezone('utc', now()))
  );

create policy sponsored_placements_admin_write
  on public.sponsored_placements
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- internal/admin-only tables
create policy ad_impressions_admin_read
  on public.ad_impressions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

create policy ad_clicks_admin_read
  on public.ad_clicks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

create policy moderation_reports_admin_all
  on public.moderation_reports
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

create policy admin_audit_logs_admin_read
  on public.admin_audit_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

create policy worker_runs_admin_read
  on public.worker_runs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and au.is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- Grants
-- Public roles are intentionally read-only except submissions.
-- Service role handles scraper, workers, admin server actions, and storage.
-- ----------------------------------------------------------------------------
grant select on public.channels to anon, authenticated;
grant select on public.tokens to anon, authenticated;
grant select on public.calls to anon, authenticated;
grant select on public.call_metrics to anon, authenticated;
grant select on public.channel_stats to anon, authenticated;
grant select on public.ads to anon, authenticated;
grant select on public.sponsored_placements to anon, authenticated;
grant select on public.trending_tokens to anon, authenticated;
grant insert on public.submissions to anon, authenticated;
grant select on public.admin_users to authenticated;

-- ----------------------------------------------------------------------------
-- Storage bucket used by the admin UI for ad creative uploads
-- Managed through service role; no public write policy is granted here.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('admin-assets', 'admin-assets', true)
on conflict (id) do nothing;

commit;
