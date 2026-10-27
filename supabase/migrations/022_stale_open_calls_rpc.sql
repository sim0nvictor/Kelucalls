begin;

-- ============================================================================
-- Migration: 022_stale_open_calls_rpc.sql
-- Purpose:  Provide an efficient database-level query for the price worker
--           to select stale open calls prioritized by metrics freshness.
--
-- Prioritizes:
--   1. Open calls that have never had metrics refreshed (refreshed_at IS NULL).
--   2. Open calls with the oldest refreshed_at timestamp.
--   3. Ties broken by called_at ascending.
--
-- Includes a supporting index on call_metrics(refreshed_at) to accelerate the
-- sort over large call sets without full-table scans.
-- ============================================================================

create index if not exists call_metrics_refreshed_at_idx
  on public.call_metrics (refreshed_at asc nulls first);

create or replace function public.get_stale_open_calls(p_limit int default 500)
returns table (
  id uuid,
  token_id uuid,
  entry_price_usd numeric,
  called_at timestamptz,
  channel_id uuid,
  contract_address text,
  chain text
) language sql stable as $$
  select 
    c.id,
    c.token_id,
    c.entry_price_usd,
    c.called_at,
    c.channel_id,
    t.contract_address,
    t.chain::text as chain
  from public.calls c
  join public.tokens t on t.id = c.token_id
  left join public.call_metrics cm on cm.call_id = c.id
  where c.status = 'open'
    and t.contract_address is not null
  order by 
    cm.refreshed_at asc nulls first,
    c.called_at asc
  limit p_limit;
$$;

comment on function public.get_stale_open_calls(int) is 
  'Selects open calls with valid token contract addresses, ordered by metric staleness for background price polling.';

commit;
