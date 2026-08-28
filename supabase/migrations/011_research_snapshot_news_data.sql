begin;

-- Store normalized news-provider items alongside the daily research snapshot.
-- This is additive and keeps the table internal under the existing RLS posture.

alter table public.research_snapshots
  add column if not exists news_data jsonb;

alter table public.research_snapshots
  drop constraint if exists research_snapshots_news_data_object_chk;

alter table public.research_snapshots
  add constraint research_snapshots_news_data_object_chk
    check (news_data is null or jsonb_typeof(news_data) = 'object');

comment on column public.research_snapshots.news_data is
'Normalized news-provider items with source URLs, original publication timestamps, deterministic categories/entities, and provider status.';

commit;
