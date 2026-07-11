-- =============================================================================
-- Kelucalls Production Schema v2
-- =============================================================================
-- Changes from v1:
--   1. trending_tokens view now uses security_invoker = true (fixes lint warning)
--   2. is_admin() moved after table creation (fixes line 86 error)
--   3. Admin separation: admin_users table drives all privileged access
--   4. Public users: read-only on active/published data + submit channels
--   5. Admins: full CRUD on everything via RLS policy checks
--   6. service_role: bypasses RLS entirely (safe for scraper/workers)
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------------------
-- Safe development reset (drops in dependency order)
-- ---------------------------------------------------------------------------
drop view  if exists public.trending_tokens;
drop function if exists public.refresh_channel_stats(uuid);
drop function if exists public.is_admin() cascade;
drop function if exists public.set_updated_at();

drop table if exists public.ads          cascade;
drop table if exists public.submissions  cascade;
drop table if exists public.channel_stats cascade;
drop table if exists public.call_metrics cascade;
drop table if exists public.calls        cascade;
drop table if exists public.tokens       cascade;
drop table if exists public.channels     cascade;
drop table if exists public.admin_users  cascade;

drop type if exists public.ad_status        cascade;
drop type if exists public.ad_placement     cascade;
drop type if exists public.submission_status cascade;
drop type if exists public.call_status      cascade;
drop type if exists public.token_status     cascade;
drop type if exists public.channel_status   cascade;
drop type if exists public.blockchain       cascade;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.blockchain as enum (
  'solana','ethereum','bsc','base','arbitrum',
  'polygon','avalanche','sui','tron','other'
);

create type public.channel_status    as enum ('pending','active','paused','archived');
create type public.token_status      as enum ('active','inactive','archived');
create type public.call_status       as enum ('open','closed','invalid','hidden');
create type public.submission_status as enum ('pending','approved','rejected');
create type public.ad_status         as enum ('draft','active','paused','expired');
create type public.ad_placement      as enum (
  'homepage','channels','live_feed','tokens','channel_detail'
);

-- ---------------------------------------------------------------------------
-- Trigger: auto-update updated_at (no table deps — safe to define early)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Admin principals
-- Trusted users who can access the internal control system
create table public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      citext unique,
  full_name  text,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_email_chk
    check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

comment on table public.admin_users
  is 'Trusted admins who manage channels, ads, and submissions via the internal control system.';

-- Channels
create table public.channels (
  id                         uuid primary key default gen_random_uuid(),
  slug                       citext      not null,
  telegram_handle            citext      not null,
  telegram_handle_normalized text generated always as (
    lower(replace(btrim(telegram_handle::text), '@', ''))
  ) stored,
  telegram_url               text        not null,
  telegram_peer_id           bigint,
  title                      text        not null,
  description                text,
  avatar_url                 text,
  status                     public.channel_status not null default 'pending',
  is_paid_channel            boolean     not null default false,
  is_verified                boolean     not null default false,
  notes                      text,
  metadata                   jsonb       not null default '{}'::jsonb,
  approved_at                timestamptz,
  last_scraped_at            timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint channels_slug_key                       unique (slug),
  constraint channels_telegram_handle_normalized_key unique (telegram_handle_normalized),
  constraint channels_telegram_url_key               unique (telegram_url),
  constraint channels_telegram_peer_id_key           unique (telegram_peer_id),
  constraint channels_slug_chk         check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint channels_telegram_url_chk check (telegram_url ~* '^https?://'),
  constraint channels_avatar_url_chk   check (avatar_url is null or avatar_url ~* '^https?://')
);

create trigger channels_set_updated_at
  before update on public.channels
  for each row execute function public.set_updated_at();

comment on table public.channels is 'Tracked Telegram channels that publish token calls.';

-- Tokens
create table public.tokens (
  id                          uuid primary key default gen_random_uuid(),
  slug                        citext      not null,
  symbol                      citext      not null,
  name                        text,
  description                 text,
  logo_url                    text,
  chain                       public.blockchain   not null default 'solana',
  status                      public.token_status not null default 'active',
  contract_address            text,
  contract_address_normalized text generated always as (
    nullif(lower(btrim(contract_address)), '')
  ) stored,
  website_url                 text,
  coingecko_id                text,
  dexscreener_pair_id         text,
  last_price_usd              numeric(24,12),
  last_market_cap_usd         numeric(24,2),
  last_seen_at                timestamptz,
  metadata                    jsonb       not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint tokens_slug_key                unique (slug),
  constraint tokens_symbol_chain_key        unique (chain, symbol),
  constraint tokens_chain_contract_key      unique (chain, contract_address_normalized),
  constraint tokens_coingecko_id_key        unique (coingecko_id),
  constraint tokens_dexscreener_pair_id_key unique (dexscreener_pair_id),
  constraint tokens_slug_chk                check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tokens_logo_url_chk            check (logo_url is null or logo_url ~* '^https?://'),
  constraint tokens_website_url_chk         check (website_url is null or website_url ~* '^https?://'),
  constraint tokens_last_price_usd_chk      check (last_price_usd is null or last_price_usd >= 0),
  constraint tokens_last_market_cap_usd_chk check (last_market_cap_usd is null or last_market_cap_usd >= 0)
);

create trigger tokens_set_updated_at
  before update on public.tokens
  for each row execute function public.set_updated_at();

comment on table public.tokens is 'Normalized token registry used by calls and analytics.';

-- Calls
create table public.calls (
  id                                   uuid primary key default gen_random_uuid(),
  channel_id                           uuid        not null references public.channels(id) on delete cascade,
  token_id                             uuid        not null references public.tokens(id)   on delete restrict,
  telegram_message_id                  text,
  message_text                         text        not null,
  called_at                            timestamptz not null,
  detected_symbol                      citext,
  detected_contract_address            text,
  detected_contract_address_normalized text generated always as (
    nullif(lower(btrim(detected_contract_address)), '')
  ) stored,
  entry_price_usd                      numeric(24,12) not null,
  entry_market_cap_usd                 numeric(24,2),
  confidence_score                     numeric(5,4)   not null default 0.5000,
  status                               public.call_status not null default 'open',
  source_metadata                      jsonb          not null default '{}'::jsonb,
  created_at                           timestamptz    not null default now(),
  updated_at                           timestamptz    not null default now(),
  constraint calls_channel_telegram_message_key unique (channel_id, telegram_message_id),
  constraint calls_entry_price_usd_chk          check (entry_price_usd > 0),
  constraint calls_entry_market_cap_usd_chk     check (entry_market_cap_usd is null or entry_market_cap_usd >= 0),
  constraint calls_confidence_score_chk         check (confidence_score >= 0 and confidence_score <= 1)
);

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();

comment on table public.calls is 'Canonical call events scraped from Telegram channels.';

-- Call metrics
create table public.call_metrics (
  call_id                     uuid primary key references public.calls(id) on delete cascade,
  current_price_usd           numeric(24,12),
  current_market_cap_usd      numeric(24,2),
  peak_price_usd              numeric(24,12),
  peak_market_cap_usd         numeric(24,2),
  current_roi_pct             numeric(12,4)  not null default 0,
  peak_roi_pct                numeric(12,4)  not null default 0,
  current_multiple            numeric(18,6)  not null default 1,
  peak_multiple               numeric(18,6)  not null default 1,
  is_win                      boolean        not null default false,
  hit_2x                      boolean        not null default false,
  hit_5x                      boolean        not null default false,
  hit_10x                     boolean        not null default false,
  hit_100x                    boolean        not null default false,
  simulated_investment_usd    numeric(12,2)  not null default 10,
  simulated_current_value_usd numeric(16,4)  not null default 10,
  simulated_peak_value_usd    numeric(16,4)  not null default 10,
  simulated_current_pnl_usd   numeric(16,4)  not null default 0,
  simulated_peak_pnl_usd      numeric(16,4)  not null default 0,
  refreshed_at                timestamptz    not null default now(),
  updated_at                  timestamptz    not null default now(),
  constraint call_metrics_current_price_usd_chk       check (current_price_usd is null or current_price_usd >= 0),
  constraint call_metrics_current_market_cap_usd_chk  check (current_market_cap_usd is null or current_market_cap_usd >= 0),
  constraint call_metrics_peak_price_usd_chk          check (peak_price_usd is null or peak_price_usd >= 0),
  constraint call_metrics_peak_market_cap_usd_chk     check (peak_market_cap_usd is null or peak_market_cap_usd >= 0),
  constraint call_metrics_current_multiple_chk        check (current_multiple >= 0),
  constraint call_metrics_peak_multiple_chk           check (peak_multiple >= 0),
  constraint call_metrics_simulated_investment_usd_chk check (simulated_investment_usd > 0)
);

create trigger call_metrics_set_updated_at
  before update on public.call_metrics
  for each row execute function public.set_updated_at();

comment on table public.call_metrics is 'Derived ROI, PnL, hit-rate, and breakout metrics for each call.';

-- Channel stats (precomputed leaderboard)
create table public.channel_stats (
  channel_id                  uuid primary key references public.channels(id) on delete cascade,
  total_calls                 integer       not null default 0,
  wins                        integer       not null default 0,
  losses                      integer       not null default 0,
  win_rate_pct                numeric(12,4) not null default 0,
  average_roi_pct             numeric(12,4) not null default 0,
  median_roi_pct              numeric(12,4) not null default 0,
  average_peak_roi_pct        numeric(12,4) not null default 0,
  average_multiple            numeric(18,6) not null default 1,
  best_multiple               numeric(18,6) not null default 1,
  hit_2x_count                integer       not null default 0,
  hit_5x_count                integer       not null default 0,
  hit_10x_count               integer       not null default 0,
  hit_100x_count              integer       not null default 0,
  simulated_investment_usd    numeric(16,4) not null default 0,
  simulated_current_value_usd numeric(16,4) not null default 0,
  simulated_peak_value_usd    numeric(16,4) not null default 0,
  simulated_current_pnl_usd   numeric(16,4) not null default 0,
  simulated_peak_pnl_usd      numeric(16,4) not null default 0,
  ranking_score               numeric(18,6) not null default 0,
  last_call_at                timestamptz,
  refreshed_at                timestamptz   not null default now(),
  updated_at                  timestamptz   not null default now(),
  constraint channel_stats_total_calls_chk    check (total_calls >= 0),
  constraint channel_stats_wins_chk           check (wins >= 0),
  constraint channel_stats_losses_chk         check (losses >= 0),
  constraint channel_stats_hit_2x_count_chk   check (hit_2x_count >= 0),
  constraint channel_stats_hit_5x_count_chk   check (hit_5x_count >= 0),
  constraint channel_stats_hit_10x_count_chk  check (hit_10x_count >= 0),
  constraint channel_stats_hit_100x_count_chk check (hit_100x_count >= 0)
);

create trigger channel_stats_set_updated_at
  before update on public.channel_stats
  for each row execute function public.set_updated_at();

comment on table public.channel_stats is 'Precomputed leaderboard aggregates per channel.';

-- Submissions
-- Anyone can submit a channel; only admins can review/approve
create table public.submissions (
  id                   uuid primary key default gen_random_uuid(),
  telegram_handle      citext      not null,
  telegram_url         text,
  channel_name         text        not null,
  description          text,
  submitter_contact    text,
  fast_track_requested boolean     not null default false,
  status               public.submission_status not null default 'pending',
  review_notes         text,
  approved_channel_id  uuid references public.channels(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint submissions_telegram_url_chk
    check (telegram_url is null or telegram_url ~* '^https?://')
);

create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

comment on table public.submissions
  is 'Public queue for channel suggestions. Admins review and approve via internal control system.';

-- Ads
-- Managed entirely by admins via internal control system
create table public.ads (
  id              uuid primary key default gen_random_uuid(),
  channel_id      uuid           not null references public.channels(id) on delete cascade,
  label           text           not null,
  placement       public.ad_placement not null,
  destination_url text           not null,
  creative_copy   text,
  image_url       text,
  starts_at       timestamptz    not null,
  ends_at         timestamptz,
  priority        integer        not null default 100,
  status          public.ad_status not null default 'draft',
  budget_usd      numeric(12,2),
  metadata        jsonb          not null default '{}'::jsonb,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),
  constraint ads_destination_url_chk check (destination_url ~* '^https?://'),
  constraint ads_image_url_chk       check (image_url is null or image_url ~* '^https?://'),
  constraint ads_budget_usd_chk      check (budget_usd is null or budget_usd >= 0),
  constraint ads_priority_chk        check (priority >= 0),
  constraint ads_ends_at_chk         check (ends_at is null or ends_at > starts_at)
);

create trigger ads_set_updated_at
  before update on public.ads
  for each row execute function public.set_updated_at();

comment on table public.ads
  is 'Sponsored placements managed by admins via internal control system.';

-- ---------------------------------------------------------------------------
-- is_admin() — defined AFTER all tables so admin_users exists
-- Uses security definer so it can always read admin_users regardless of
-- the calling user's RLS context. Safe because it only returns a boolean.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.is_active = true
  );
$$;

comment on function public.is_admin()
  is 'Returns true if the calling user is a registered active admin. Used in all RLS admin policies.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Channels
create index channels_public_list_idx
  on public.channels (status, is_verified desc, title, created_at desc)
  where status in ('active', 'paused');

create index channels_last_scraped_idx
  on public.channels (last_scraped_at desc nulls last);

create index channels_paid_status_idx
  on public.channels (is_paid_channel, status);

-- Tokens
create index tokens_status_chain_idx
  on public.tokens (status, chain, symbol);

create index tokens_last_seen_idx
  on public.tokens (last_seen_at desc nulls last);

create index tokens_contract_lookup_idx
  on public.tokens (chain, contract_address_normalized)
  where contract_address_normalized is not null;

-- Calls
create index calls_recent_idx
  on public.calls (called_at desc)
  where status in ('open', 'closed');

create index calls_channel_recent_idx
  on public.calls (channel_id, called_at desc)
  where status in ('open', 'closed');

create index calls_token_recent_idx
  on public.calls (token_id, called_at desc)
  where status in ('open', 'closed');

create index calls_status_called_at_idx
  on public.calls (status, called_at desc);

create index calls_detected_contract_idx
  on public.calls (detected_contract_address_normalized)
  where detected_contract_address_normalized is not null;

-- Call metrics
create index call_metrics_peak_multiple_idx
  on public.call_metrics (peak_multiple desc);

create index call_metrics_roi_idx
  on public.call_metrics (current_roi_pct desc);

-- Channel stats
create index channel_stats_ranking_idx
  on public.channel_stats (ranking_score desc);

create index channel_stats_pnl_idx
  on public.channel_stats (simulated_current_pnl_usd desc);

create index channel_stats_win_rate_idx
  on public.channel_stats (win_rate_pct desc);

-- Submissions
create index submissions_status_created_at_idx
  on public.submissions (status, created_at desc);

create index submissions_handle_idx
  on public.submissions (telegram_handle);

-- Ads
create index ads_public_schedule_idx
  on public.ads (placement, priority asc, starts_at desc)
  where status = 'active';

create index ads_channel_schedule_idx
  on public.ads (channel_id, starts_at desc);

-- ---------------------------------------------------------------------------
-- Channel stats refresh function
-- ---------------------------------------------------------------------------
create or replace function public.refresh_channel_stats(target_channel_id uuid default null)
returns void
language sql
as $$
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
    c.channel_id,
    count(*)::integer                                                         as total_calls,
    count(*) filter (where cm.is_win)::integer                                as wins,
    count(*) filter (where not cm.is_win)::integer                            as losses,
    coalesce(avg(case when cm.is_win then 100 else 0 end), 0)::numeric(12,4)  as win_rate_pct,
    coalesce(avg(cm.current_roi_pct), 0)::numeric(12,4)                       as average_roi_pct,
    coalesce(
      percentile_cont(0.5) within group (order by cm.current_roi_pct), 0
    )::numeric(12,4)                                                          as median_roi_pct,
    coalesce(avg(cm.peak_roi_pct), 0)::numeric(12,4)                          as average_peak_roi_pct,
    coalesce(avg(cm.current_multiple), 1)::numeric(18,6)                      as average_multiple,
    coalesce(max(cm.peak_multiple), 1)::numeric(18,6)                         as best_multiple,
    count(*) filter (where cm.hit_2x)::integer                                as hit_2x_count,
    count(*) filter (where cm.hit_5x)::integer                                as hit_5x_count,
    count(*) filter (where cm.hit_10x)::integer                               as hit_10x_count,
    count(*) filter (where cm.hit_100x)::integer                              as hit_100x_count,
    coalesce(sum(cm.simulated_investment_usd), 0)::numeric(16,4)              as simulated_investment_usd,
    coalesce(sum(cm.simulated_current_value_usd), 0)::numeric(16,4)           as simulated_current_value_usd,
    coalesce(sum(cm.simulated_peak_value_usd), 0)::numeric(16,4)              as simulated_peak_value_usd,
    coalesce(sum(cm.simulated_current_pnl_usd), 0)::numeric(16,4)            as simulated_current_pnl_usd,
    coalesce(sum(cm.simulated_peak_pnl_usd), 0)::numeric(16,4)               as simulated_peak_pnl_usd,
    (
      coalesce(avg(cm.current_roi_pct), 0) * 0.5 +
      coalesce(avg(case when cm.is_win then 100 else 0 end), 0) * 0.3 +
      ln(count(*) + 1) * 0.2
    )::numeric(18,6)                                                          as ranking_score,
    max(c.called_at)                                                          as last_call_at,
    now()                                                                     as refreshed_at
  from public.calls c
  join public.call_metrics cm on cm.call_id = c.id
  where c.status in ('open', 'closed')
    and (target_channel_id is null or c.channel_id = target_channel_id)
  group by c.channel_id
  on conflict (channel_id) do update set
    total_calls                 = excluded.total_calls,
    wins                        = excluded.wins,
    losses                      = excluded.losses,
    win_rate_pct                = excluded.win_rate_pct,
    average_roi_pct             = excluded.average_roi_pct,
    median_roi_pct              = excluded.median_roi_pct,
    average_peak_roi_pct        = excluded.average_peak_roi_pct,
    average_multiple            = excluded.average_multiple,
    best_multiple               = excluded.best_multiple,
    hit_2x_count                = excluded.hit_2x_count,
    hit_5x_count                = excluded.hit_5x_count,
    hit_10x_count               = excluded.hit_10x_count,
    hit_100x_count              = excluded.hit_100x_count,
    simulated_investment_usd    = excluded.simulated_investment_usd,
    simulated_current_value_usd = excluded.simulated_current_value_usd,
    simulated_peak_value_usd    = excluded.simulated_peak_value_usd,
    simulated_current_pnl_usd   = excluded.simulated_current_pnl_usd,
    simulated_peak_pnl_usd      = excluded.simulated_peak_pnl_usd,
    ranking_score               = excluded.ranking_score,
    last_call_at                = excluded.last_call_at,
    refreshed_at                = excluded.refreshed_at;
$$;

comment on function public.refresh_channel_stats(uuid)
  is 'Upserts precomputed leaderboard stats for one channel (by id) or all channels (null).';

-- ---------------------------------------------------------------------------
-- Trending tokens view
-- SECURITY INVOKER = true ensures RLS is evaluated as the querying user,
-- not the view owner. This prevents anon users seeing inactive/hidden tokens.
-- ---------------------------------------------------------------------------
create view public.trending_tokens
  with (security_invoker = true)
as
select
  t.id,
  t.symbol,
  t.name,
  t.description,
  t.logo_url,
  t.chain,
  t.contract_address,
  count(c.id)::integer                                 as total_calls,
  count(distinct c.channel_id)::integer                as unique_channels,
  max(c.called_at)                                     as last_called_at,
  coalesce(avg(cm.current_roi_pct), 0)::numeric(12,4)  as average_roi_pct,
  coalesce(max(cm.peak_multiple), 1)::numeric(18,6)    as best_multiple
from public.tokens t
join public.calls c         on c.token_id = t.id and c.status in ('open', 'closed')
join public.call_metrics cm on cm.call_id = c.id
where t.status = 'active'
group by t.id;

comment on view public.trending_tokens
  is 'Aggregated token popularity across active channels. Uses security_invoker so RLS applies to the querying user.';

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------
alter table public.admin_users   enable row level security;
alter table public.channels      enable row level security;
alter table public.tokens        enable row level security;
alter table public.calls         enable row level security;
alter table public.call_metrics  enable row level security;
alter table public.channel_stats enable row level security;
alter table public.submissions   enable row level security;
alter table public.ads           enable row level security;

-- ---------------------------------------------------------------------------
-- RLS Policies — admin_users
-- Only admins can see or manage the admin_users table.
-- Initial admin must be seeded directly via service_role or Supabase dashboard.
-- ---------------------------------------------------------------------------
create policy "admin_users_admin_all"
  on public.admin_users
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — channels
-- Public: read active/paused channels
-- Admin: read everything + full write
-- ---------------------------------------------------------------------------
create policy "channels_public_read"
  on public.channels for select
  to anon, authenticated
  using (status in ('active', 'paused'));

create policy "channels_admin_read_all"
  on public.channels for select
  to authenticated
  using (public.is_admin());

create policy "channels_admin_insert"
  on public.channels for insert
  to authenticated
  with check (public.is_admin());

create policy "channels_admin_update"
  on public.channels for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "channels_admin_delete"
  on public.channels for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — tokens
-- Public: read active tokens
-- Admin: read everything + full write
-- ---------------------------------------------------------------------------
create policy "tokens_public_read"
  on public.tokens for select
  to anon, authenticated
  using (status = 'active');

create policy "tokens_admin_read_all"
  on public.tokens for select
  to authenticated
  using (public.is_admin());

create policy "tokens_admin_insert"
  on public.tokens for insert
  to authenticated
  with check (public.is_admin());

create policy "tokens_admin_update"
  on public.tokens for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "tokens_admin_delete"
  on public.tokens for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — calls
-- Public: read open/closed calls from active channels
-- Admin: read everything + full write
-- ---------------------------------------------------------------------------
create policy "calls_public_read"
  on public.calls for select
  to anon, authenticated
  using (
    status in ('open', 'closed')
    and exists (
      select 1 from public.channels ch
      where ch.id = calls.channel_id
        and ch.status in ('active', 'paused')
    )
  );

create policy "calls_admin_read_all"
  on public.calls for select
  to authenticated
  using (public.is_admin());

create policy "calls_admin_insert"
  on public.calls for insert
  to authenticated
  with check (public.is_admin());

create policy "calls_admin_update"
  on public.calls for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "calls_admin_delete"
  on public.calls for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — call_metrics
-- Public: read metrics for visible calls
-- Admin: read everything + full write
-- ---------------------------------------------------------------------------
create policy "call_metrics_public_read"
  on public.call_metrics for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.calls c
      join public.channels ch on ch.id = c.channel_id
      where c.id = call_metrics.call_id
        and c.status in ('open', 'closed')
        and ch.status in ('active', 'paused')
    )
  );

create policy "call_metrics_admin_read_all"
  on public.call_metrics for select
  to authenticated
  using (public.is_admin());

create policy "call_metrics_admin_insert"
  on public.call_metrics for insert
  to authenticated
  with check (public.is_admin());

create policy "call_metrics_admin_update"
  on public.call_metrics for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "call_metrics_admin_delete"
  on public.call_metrics for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — channel_stats
-- Public: read stats for active/paused channels
-- Admin: read everything + full write
-- ---------------------------------------------------------------------------
create policy "channel_stats_public_read"
  on public.channel_stats for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.channels ch
      where ch.id = channel_stats.channel_id
        and ch.status in ('active', 'paused')
    )
  );

create policy "channel_stats_admin_read_all"
  on public.channel_stats for select
  to authenticated
  using (public.is_admin());

create policy "channel_stats_admin_insert"
  on public.channel_stats for insert
  to authenticated
  with check (public.is_admin());

create policy "channel_stats_admin_update"
  on public.channel_stats for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "channel_stats_admin_delete"
  on public.channel_stats for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — submissions
-- Public: insert only (no reads — submitters can't see other submissions)
-- Admin: full read + write via internal control system
-- ---------------------------------------------------------------------------
create policy "submissions_public_insert"
  on public.submissions for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and approved_channel_id is null
    and review_notes is null
  );

create policy "submissions_admin_read_all"
  on public.submissions for select
  to authenticated
  using (public.is_admin());

create policy "submissions_admin_update"
  on public.submissions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "submissions_admin_delete"
  on public.submissions for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- RLS Policies — ads
-- Public: read active ads in their scheduled window from active channels
-- Admin: full read + write via internal control system
-- ---------------------------------------------------------------------------
create policy "ads_public_read"
  on public.ads for select
  to anon, authenticated
  using (
    status = 'active'
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
    and exists (
      select 1 from public.channels ch
      where ch.id = ads.channel_id
        and ch.status in ('active', 'paused')
    )
  );

create policy "ads_admin_read_all"
  on public.ads for select
  to authenticated
  using (public.is_admin());

create policy "ads_admin_insert"
  on public.ads for insert
  to authenticated
  with check (public.is_admin());

create policy "ads_admin_update"
  on public.ads for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "ads_admin_delete"
  on public.ads for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- anon role: public read-only + can submit channels
grant select on public.channels        to anon;
grant select on public.tokens          to anon;
grant select on public.calls           to anon;
grant select on public.call_metrics    to anon;
grant select on public.channel_stats   to anon;
grant select on public.ads             to anon;
grant select on public.trending_tokens to anon;
grant insert on public.submissions     to anon;

-- authenticated role: full CRUD — all gated behind RLS is_admin() checks
grant select, insert, update, delete on public.admin_users   to authenticated;
grant select, insert, update, delete on public.channels      to authenticated;
grant select, insert, update, delete on public.tokens        to authenticated;
grant select, insert, update, delete on public.calls         to authenticated;
grant select, insert, update, delete on public.call_metrics  to authenticated;
grant select, insert, update, delete on public.channel_stats to authenticated;
grant select, insert, update, delete on public.submissions   to authenticated;
grant select, insert, update, delete on public.ads           to authenticated;
grant select on public.trending_tokens                       to authenticated;

-- execute grants for RPC calls
grant execute on function public.refresh_channel_stats(uuid) to authenticated;
grant execute on function public.is_admin()                  to authenticated;

commit;

-- =============================================================================
-- HOW TO SEED YOUR FIRST ADMIN
-- Run this in Supabase SQL editor after creating your user via Auth:
--
-- insert into public.admin_users (user_id, email, full_name)
-- values (
--   'your-auth-user-uuid-here',
--   'you@youremail.com',
--   'Your Name'
-- );
--
-- Get your user UUID from: Supabase Dashboard → Authentication → Users
-- =============================================================================