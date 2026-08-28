begin;

-- JSON-first Daily Research Generator output. The report is internal and
-- remains protected by the existing research_snapshots RLS posture.
alter table public.research_snapshots
  add column if not exists generated_report jsonb;

alter table public.research_snapshots
  drop constraint if exists research_snapshots_generated_report_object_chk;

alter table public.research_snapshots
  add constraint research_snapshots_generated_report_object_chk
    check (generated_report is null or jsonb_typeof(generated_report) = 'object');

comment on column public.research_snapshots.generated_report is
'Structured JSON Daily Research report generated only from the stored normalized snapshot and deterministic signal results. Not HTML and not publicly readable.';

commit;