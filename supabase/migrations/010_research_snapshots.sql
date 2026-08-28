begin;

-- ============================================================================
-- Daily Research Snapshots
--
-- Internal persistence for the Daily Research data collector. This table stores
-- the normalized provider payloads used by the future research engine. It does
-- not generate AI content and is not exposed to the public API.
-- ============================================================================

create table if not exists public.research_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  collected_at timestamptz not null,

  market_data jsonb,
  sentiment_data jsonb,
  defi_data jsonb,
  provider_status jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default timezone('utc', now()),

  constraint research_snapshots_date_unique unique (snapshot_date),
  constraint research_snapshots_market_data_object_chk
    check (market_data is null or jsonb_typeof(market_data) = 'object'),
  constraint research_snapshots_sentiment_data_object_chk
    check (sentiment_data is null or jsonb_typeof(sentiment_data) = 'object'),
  constraint research_snapshots_defi_data_object_chk
    check (defi_data is null or jsonb_typeof(defi_data) = 'object'),
  constraint research_snapshots_provider_status_object_chk
    check (jsonb_typeof(provider_status) = 'object')
);

comment on table public.research_snapshots is
'Internal daily snapshots of normalized research source data. Written by service-role collectors; not publicly readable.';

comment on column public.research_snapshots.snapshot_date is
'UTC calendar date represented by the collected_at timestamp. One stored snapshot per day.';

comment on column public.research_snapshots.collected_at is
'UTC timestamp when this combined snapshot was assembled.';

comment on column public.research_snapshots.market_data is
'Normalized market data payload, including provider source and fetchedAt provenance.';

comment on column public.research_snapshots.sentiment_data is
'Normalized sentiment payload, including provider source and fetchedAt provenance.';

comment on column public.research_snapshots.defi_data is
'Normalized DeFi payload, including provider source and fetchedAt provenance.';

comment on column public.research_snapshots.provider_status is
'Per-provider success/failure, collection timestamp, and non-secret diagnostic metadata.';

create index if not exists research_snapshots_collected_at_idx
  on public.research_snapshots (collected_at desc);

alter table public.research_snapshots enable row level security;

-- Intentionally no anon/authenticated policies or grants. The service role used
-- by collectors bypasses RLS; browser and normal user sessions cannot read or
-- write these internal source payloads.

commit;

