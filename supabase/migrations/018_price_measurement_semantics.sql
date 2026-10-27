begin;

-- ============================================================================
-- Price Measurement Semantics — Kelucalls (Migration 018)
--
-- 1. Recreates refresh_channel_stats() function
-- 2. Recreates trending_tokens materialized view + indexes
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. refresh_channel_stats()
-- ----------------------------------------------------------------------------
create or replace function public.refresh_channel_stats(
  target_channel_id uuid default null
)
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
    ch.id,
    count(c.id)::integer,
    count(c.id) filter (where cm.is_win)::integer,
    count(c.id) filter (where cm.call_id is not null and not cm.is_win)::integer,
    coalesce(avg(case when cm.is_win then 100 else 0 end), 0)::numeric(12, 4),
    avg(cm.current_roi_pct)::numeric(12, 4),
    percentile_cont(0.5) within group (order by cm.current_roi_pct)::numeric(12, 4),
    avg(cm.peak_roi_pct)::numeric(12, 4),
    coalesce(avg(cm.current_multiple), 1)::numeric(18, 6),
    coalesce(max(cm.peak_multiple), 1)::numeric(18, 6),
    count(c.id) filter (where cm.hit_2x)::integer,
    count(c.id) filter (where cm.hit_5x)::integer,
    count(c.id) filter (where cm.hit_10x)::integer,
    count(c.id) filter (where cm.hit_50x)::integer,
    count(c.id) filter (where cm.hit_100x)::integer,
    coalesce(sum(cm.simulated_investment_usd), 0)::numeric(16, 4),
    sum(cm.simulated_current_value_usd)::numeric(16, 4),
    sum(cm.simulated_peak_value_usd)::numeric(16, 4),
    sum(cm.simulated_current_pnl_usd)::numeric(16, 4),
    sum(cm.simulated_peak_pnl_usd)::numeric(16, 4),
    (
      case
        when ch.is_paid_channel then 0
        when count(c.id) = 0    then 0
        else
          coalesce(avg(cm.current_roi_pct), 0)                           * 0.5
          + coalesce(avg(case when cm.is_win then 100 else 0 end), 0)    * 0.3
          + ln(count(c.id) + 1)                                          * 0.2
      end
    )::numeric(18, 6),
    max(c.called_at),
    timezone('utc', now())
  from public.channels ch
  left join public.calls c
    on  c.channel_id = ch.id
    and c.status in ('open', 'closed')
  left join public.call_metrics cm
    on  cm.call_id = c.id
  where
    ch.status in ('active', 'paused')
    and (target_channel_id is null or ch.id = target_channel_id)
  group by
    ch.id,
    ch.is_paid_channel
  on conflict (channel_id) do update set
    total_calls                  = excluded.total_calls,
    wins                         = excluded.wins,
    losses                       = excluded.losses,
    win_rate_pct                 = excluded.win_rate_pct,
    average_roi_pct              = excluded.average_roi_pct,
    median_roi_pct               = excluded.median_roi_pct,
    average_peak_roi_pct         = excluded.average_peak_roi_pct,
    average_multiple             = excluded.average_multiple,
    best_multiple                = excluded.best_multiple,
    hit_2x_count                 = excluded.hit_2x_count,
    hit_5x_count                 = excluded.hit_5x_count,
    hit_10x_count                = excluded.hit_10x_count,
    hit_50x_count                = excluded.hit_50x_count,
    hit_100x_count               = excluded.hit_100x_count,
    simulated_investment_usd     = excluded.simulated_investment_usd,
    simulated_current_value_usd  = excluded.simulated_current_value_usd,
    simulated_peak_value_usd     = excluded.simulated_peak_value_usd,
    simulated_current_pnl_usd    = excluded.simulated_current_pnl_usd,
    simulated_peak_pnl_usd       = excluded.simulated_peak_pnl_usd,
    ranking_score                = excluded.ranking_score,
    last_call_at                 = excluded.last_call_at,
    refreshed_at                 = excluded.refreshed_at;

  delete from public.channel_stats cs
  where
    (target_channel_id is null or cs.channel_id = target_channel_id)
    and not exists (
      select 1
      from public.channels ch
      where ch.id = cs.channel_id
        and ch.status in ('active', 'paused')
    );

end;
$$;


-- ----------------------------------------------------------------------------
-- 2. trending_tokens materialized view
-- ----------------------------------------------------------------------------
drop materialized view if exists public.trending_tokens cascade;

create materialized view public.trending_tokens as
select
  t.id,
  t.symbol::text,
  t.name,
  t.description,
  t.logo_url,
  t.chain,
  t.contract_address,
  count(c.id)::integer                        as total_calls,
  count(distinct c.channel_id)::integer       as unique_channels,
  max(c.called_at)                            as last_called_at,
  avg(cm.current_roi_pct)::numeric(12, 4)     as avg_roi_pct,
  coalesce(max(cm.peak_multiple), 1)::numeric(18, 6) as best_multiple
from public.tokens t
join public.calls c
  on  c.token_id = t.id
  and c.status in ('open', 'closed')
join public.channels ch
  on  ch.id = c.channel_id
  and ch.status in ('active', 'paused')
left join public.call_metrics cm
  on  cm.call_id = c.id
where t.status = 'active'
group by
  t.id,
  t.symbol,
  t.name,
  t.description,
  t.logo_url,
  t.chain,
  t.contract_address;

create unique index trending_tokens_id_idx
  on public.trending_tokens (id);

create index trending_tokens_rank_idx
  on public.trending_tokens (unique_channels desc, total_calls desc, last_called_at desc);

create index trending_tokens_chain_idx
  on public.trending_tokens (chain, unique_channels desc, total_calls desc);


commit;