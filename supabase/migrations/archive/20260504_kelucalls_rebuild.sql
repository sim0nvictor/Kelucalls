create extension if not exists pgcrypto;

create type public.channel_status as enum ('pending', 'active', 'paused', 'archived');
create type public.call_status as enum ('open', 'closed', 'invalid');
create type public.submission_status as enum ('pending', 'approved', 'rejected');
create type public.ad_status as enum ('draft', 'active', 'paused', 'expired');

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  telegram_handle text not null unique,
  telegram_url text not null unique,
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
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.tokens (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  name text,
  chain text not null default 'solana',
  contract_address text,
  coingecko_id text,
  dexscreener_pair_id text,
  last_price_usd numeric(24, 12),
  last_market_cap_usd numeric(24, 2),
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tokens_identity_unique unique nulls not distinct (chain, contract_address),
  constraint tokens_symbol_chain_unique unique (chain, symbol)
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  token_id uuid not null references public.tokens(id) on delete restrict,
  telegram_message_id text,
  message_text text not null,
  called_at timestamptz not null,
  detected_symbol text,
  detected_contract_address text,
  entry_price_usd numeric(24, 12) not null,
  entry_market_cap_usd numeric(24, 2),
  confidence_score numeric(6, 4) not null default 0.5,
  status public.call_status not null default 'open',
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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
  refreshed_at timestamptz not null default timezone('utc', now())
);

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
  refreshed_at timestamptz not null default timezone('utc', now())
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  telegram_handle text not null,
  telegram_url text,
  channel_name text not null,
  description text,
  submitter_contact text,
  fast_track_requested boolean not null default false,
  status public.submission_status not null default 'pending',
  review_notes text,
  approved_channel_id uuid references public.channels(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  label text not null,
  placement text not null,
  destination_url text not null,
  creative_copy text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  priority integer not null default 100,
  status public.ad_status not null default 'draft',
  budget_usd numeric(12, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index channels_status_idx on public.channels(status);
create index channels_paid_status_idx on public.channels(is_paid_channel, status);
create index channels_last_scraped_idx on public.channels(last_scraped_at desc nulls last);
create index tokens_symbol_idx on public.tokens(symbol);
create index tokens_contract_idx on public.tokens(contract_address) where contract_address is not null;
create index calls_channel_called_at_idx on public.calls(channel_id, called_at desc);
create index calls_token_called_at_idx on public.calls(token_id, called_at desc);
create index calls_status_idx on public.calls(status);
create index submissions_status_created_at_idx on public.submissions(status, created_at desc);
create index ads_status_placement_idx on public.ads(status, placement, starts_at desc);
create index channel_stats_ranking_idx on public.channel_stats(ranking_score desc);
create index channel_stats_pnl_idx on public.channel_stats(simulated_current_pnl_usd desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger channels_set_updated_at before update on public.channels
for each row execute function public.set_updated_at();

create trigger tokens_set_updated_at before update on public.tokens
for each row execute function public.set_updated_at();

create trigger calls_set_updated_at before update on public.calls
for each row execute function public.set_updated_at();

create trigger submissions_set_updated_at before update on public.submissions
for each row execute function public.set_updated_at();

create trigger ads_set_updated_at before update on public.ads
for each row execute function public.set_updated_at();

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
    hit_50x_count,
    hit_100x_count,
    simulated_investment_usd,
    simulated_current_value_usd,
    simulated_peak_value_usd,
    simulated_current_pnl_usd,
    simulated_peak_pnl_usd,
    ranking_score,
    refreshed_at
  )
  select
    c.channel_id,
    count(*)::integer as total_calls,
    count(*) filter (where cm.is_win)::integer as wins,
    count(*) filter (where not cm.is_win)::integer as losses,
    coalesce(avg(case when cm.is_win then 100 else 0 end), 0)::numeric(12, 4) as win_rate_pct,
    coalesce(avg(cm.current_roi_pct), 0)::numeric(12, 4) as average_roi_pct,
    coalesce(percentile_cont(0.5) within group (order by cm.current_roi_pct), 0)::numeric(12, 4) as median_roi_pct,
    coalesce(avg(cm.peak_roi_pct), 0)::numeric(12, 4) as average_peak_roi_pct,
    coalesce(avg(cm.current_multiple), 1)::numeric(18, 6) as average_multiple,
    coalesce(max(cm.peak_multiple), 1)::numeric(18, 6) as best_multiple,
    count(*) filter (where cm.hit_2x)::integer as hit_2x_count,
    count(*) filter (where cm.hit_5x)::integer as hit_5x_count,
    count(*) filter (where cm.hit_10x)::integer as hit_10x_count,
    count(*) filter (where cm.hit_50x)::integer as hit_50x_count,
    count(*) filter (where cm.hit_100x)::integer as hit_100x_count,
    coalesce(sum(cm.simulated_investment_usd), 0)::numeric(16, 4) as simulated_investment_usd,
    coalesce(sum(cm.simulated_current_value_usd), 0)::numeric(16, 4) as simulated_current_value_usd,
    coalesce(sum(cm.simulated_peak_value_usd), 0)::numeric(16, 4) as simulated_peak_value_usd,
    coalesce(sum(cm.simulated_current_pnl_usd), 0)::numeric(16, 4) as simulated_current_pnl_usd,
    coalesce(sum(cm.simulated_peak_pnl_usd), 0)::numeric(16, 4) as simulated_peak_pnl_usd,
    (
      coalesce(avg(cm.current_roi_pct), 0) * 0.5 +
      coalesce(avg(case when cm.is_win then 100 else 0 end), 0) * 0.3 +
      ln(count(*) + 1) * 0.2
    )::numeric(18, 6) as ranking_score,
    timezone('utc', now()) as refreshed_at
  from public.calls c
  join public.call_metrics cm on cm.call_id = c.id
  where target_channel_id is null or c.channel_id = target_channel_id
  group by c.channel_id
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
    refreshed_at = excluded.refreshed_at;
$$;

create view public.trending_tokens as
select
  t.id,
  t.symbol,
  t.name,
  t.chain,
  t.contract_address,
  count(c.id)::integer as total_calls,
  count(distinct c.channel_id)::integer as unique_channels,
  max(c.called_at) as last_called_at,
  coalesce(avg(cm.current_roi_pct), 0)::numeric(12, 4) as average_roi_pct,
  coalesce(max(cm.peak_multiple), 1)::numeric(18, 6) as best_multiple
from public.tokens t
join public.calls c on c.token_id = t.id
join public.call_metrics cm on cm.call_id = c.id
group by t.id;

alter table public.channels enable row level security;
alter table public.tokens enable row level security;
alter table public.calls enable row level security;
alter table public.call_metrics enable row level security;
alter table public.channel_stats enable row level security;
alter table public.submissions enable row level security;
alter table public.ads enable row level security;

create policy "public read active channels" on public.channels
for select using (status in ('active', 'paused'));

create policy "public read tokens" on public.tokens
for select using (true);

create policy "public read calls" on public.calls
for select using (true);

create policy "public read call metrics" on public.call_metrics
for select using (true);

create policy "public read channel stats" on public.channel_stats
for select using (true);

create policy "public submit channels" on public.submissions
for insert with check (true);

create policy "public read active ads" on public.ads
for select using (status = 'active');
