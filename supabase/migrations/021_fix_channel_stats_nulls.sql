begin;

-- ============================================================================
-- Migration: 021_fix_channel_stats_nulls.sql
-- Purpose:  Repair the channel_stats refresh function so it cannot emit NULL
--           values into non-null aggregate columns when a channel has no valid
--           measurable current ROI data.
--
-- This is a safety fix for the analytics refresh pipeline. It does not change
-- the current live measurement model or the Smart Score formula; it only ensures
-- the database does not reject valid refreshes when a channel has unmeasurable
-- calls or no current ROI data available.
-- ============================================================================

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
    coalesce(
      percentile_cont(0.5) within group (
        order by (
          case
            when c.entry_price_usd > 0 and cm.current_price_usd > 0
            then cm.current_roi_pct
            else null
          end
        )
      ),
      0
    )::numeric(12, 4) as median_roi_pct,
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

commit;
