begin;

-- Add the Kelucalls internal research payload to the existing
-- research_snapshots table. Mirrors the pattern set by migration 011 for
-- news_data: additive, internal, no public read.

alter table public.research_snapshots
  add column if not exists kelucalls_data jsonb;

alter table public.research_snapshots
  drop constraint if exists research_snapshots_kelucalls_data_object_chk;

alter table public.research_snapshots
  add constraint research_snapshots_kelucalls_data_object_chk
    check (kelucalls_data is null or jsonb_typeof(kelucalls_data) = 'object');

comment on column public.research_snapshots.kelucalls_data is
'Normalized Kelucalls internal call activity snapshot. Includes last 24h / previous 24h counts, active channels, unique tokens, unique channels per token, trending tokens, average ROI, best multiples, channel performance, new / emerging tokens, and call / channel velocity. All values computed deterministically from existing Kelucalls tables; no LLM involvement.';

commit;
