begin;

-- Stage B: distinguish an unmeasurable call from a genuine 0% return.
-- ROI and derived performance fields are nullable until both prices are known.
-- Channel aggregates must also represent "no measurable calls" as NULL.
alter table public.channel_stats
  alter column average_roi_pct drop not null,
  alter column median_roi_pct drop not null,
  alter column average_peak_roi_pct drop not null;

alter table public.call_metrics
  alter column current_roi_pct drop not null,
  alter column peak_roi_pct drop not null,
  alter column current_multiple drop not null,
  alter column peak_multiple drop not null,
  alter column is_win drop not null,
  alter column hit_2x drop not null,
  alter column hit_5x drop not null,
  alter column hit_10x drop not null,
  alter column hit_50x drop not null,
  alter column hit_100x drop not null,
  alter column simulated_investment_usd drop not null,
  alter column simulated_current_value_usd drop not null,
  alter column simulated_peak_value_usd drop not null,
  alter column simulated_current_pnl_usd drop not null,
  alter column simulated_peak_pnl_usd drop not null;

-- Existing zero/default metrics without a valid price basis are not measured
-- returns. Keep any available market prices and historical peak prices intact.
update public.call_metrics cm
set
  current_roi_pct = case
    when c.entry_price_usd > 0 and cm.current_price_usd > 0 then cm.current_roi_pct
    else null
  end,
  peak_roi_pct = case
    when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.peak_roi_pct
    else null
  end,
  current_multiple = case
    when c.entry_price_usd > 0 and cm.current_price_usd > 0 then cm.current_multiple
    else null
  end,
  peak_multiple = case
    when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.peak_multiple
    else null
  end,
  is_win = case
    when c.entry_price_usd > 0 and cm.current_price_usd > 0 then cm.is_win
    else null
  end,
  hit_2x = case when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.hit_2x else null end,
  hit_5x = case when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.hit_5x else null end,
  hit_10x = case when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.hit_10x else null end,
  hit_50x = case when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.hit_50x else null end,
  hit_100x = case when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.hit_100x else null end,
  simulated_investment_usd = case when c.entry_price_usd > 0 then cm.simulated_investment_usd else null end,
  simulated_current_value_usd = case
    when c.entry_price_usd > 0 and cm.current_price_usd > 0 then cm.simulated_current_value_usd
    else null
  end,
  simulated_current_pnl_usd = case
    when c.entry_price_usd > 0 and cm.current_price_usd > 0 then cm.simulated_current_pnl_usd
    else null
  end,
  simulated_peak_value_usd = case
    when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.simulated_peak_value_usd
    else null
  end,
  simulated_peak_pnl_usd = case
    when c.entry_price_usd > 0 and cm.peak_price_usd > 0 then cm.simulated_peak_pnl_usd
    else null
  end
from public.calls c
where c.id = cm.call_id
  and (
    c.entry_price_usd is null or c.entry_price_usd <= 0
    or cm.current_price_usd is null or cm.current_price_usd <= 0
    or cm.peak_price_usd is null or cm.peak_price_usd <= 0
  );

-- Rebuild channel statistics using only measurable calls for ROI and win-rate
-- calculations. The ranking formula and call-volume weight remain unchanged.
create or replace function public.refresh_channel_stats(
  target_channel_id uuid default null
)
returns void
language plpgsql
as $$
begin
  insert into public.channel_stats (
    channel_id, total_calls, wins, losses, win_rate_pct, average_roi_pct,
    median_roi_pct, average_peak_roi_pct, average_multiple, best_multiple,
    hit_2x_count, hit_5x_count, hit_10x_count, hit_50x_count, hit_100x_count,
    simulated_investment_usd, simulated_current_value_usd, simulated_peak_value_usd,
    simulated_current_pnl_usd, simulated_peak_pnl_usd, ranking_score,
    last_call_at, refreshed_at
  )
  select
    ch.id,
    count(c.id)::integer,
    count(c.id) filter (where cm.is_win is true)::integer,
    count(c.id) filter (where cm.is_win is false)::integer,
    coalesce(avg(case
      when cm.is_win is null then null
      when cm.is_win then 100
      else 0
    end), 0)::numeric(12, 4),
    avg(cm.current_roi_pct)::numeric(12, 4),
    percentile_cont(0.5) within group (order by cm.current_roi_pct)
      filter (where cm.current_roi_pct is not null)::numeric(12, 4),
    avg(cm.peak_roi_pct)::numeric(12, 4),
    coalesce(avg(cm.current_multiple), 1)::numeric(18, 6),
    coalesce(max(cm.peak_multiple), 1)::numeric(18, 6),
    count(c.id) filter (where cm.hit_2x is true)::integer,
    count(c.id) filter (where cm.hit_5x is true)::integer,
    count(c.id) filter (where cm.hit_10x is true)::integer,
    count(c.id) filter (where cm.hit_50x is true)::integer,
    count(c.id) filter (where cm.hit_100x is true)::integer,
    coalesce(sum(cm.simulated_investment_usd), 0)::numeric(16, 4),
    coalesce(sum(cm.simulated_current_value_usd), 0)::numeric(16, 4),
    coalesce(sum(cm.simulated_peak_value_usd), 0)::numeric(16, 4),
    coalesce(sum(cm.simulated_current_pnl_usd), 0)::numeric(16, 4),
    coalesce(sum(cm.simulated_peak_pnl_usd), 0)::numeric(16, 4),
    (
      case
        when ch.is_paid_channel then 0
        when count(c.id) = 0 then 0
        else
          coalesce(avg(cm.current_roi_pct), 0) * 0.5
          + coalesce(avg(case
              when cm.is_win is null then null
              when cm.is_win then 100
              else 0
            end), 0) * 0.3
          + ln(count(c.id) + 1) * 0.2
      end
    )::numeric(18, 6),
    max(c.called_at),
    timezone('utc', now())
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
      select 1 from public.channels ch
      where ch.id = cs.channel_id and ch.status in ('active', 'paused')
    );
end;
$$;

comment on function public.refresh_channel_stats(uuid) is
  'Refreshes channel stats; ROI, win rate and derived performance metrics exclude calls without valid entry/current or entry/peak prices.';

commit;
