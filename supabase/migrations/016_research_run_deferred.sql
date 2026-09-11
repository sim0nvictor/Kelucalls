begin;

-- Add a "deferred" state for retryable generation failures (e.g. OpenAI 429)
alter table public.research_run
  drop constraint if exists research_run_state_chk;

alter table public.research_run
  add constraint research_run_state_chk
    check (state in (
      'pending',
      'collecting',
      'analyzing',
      'generating',
      'validating',
      'draft',
      'deferred',
      'failed'
    ));

-- Track persisted snapshot + next retry so the worker can resume generation
-- without re-collecting providers.
alter table public.research_run
  add column if not exists snapshot_id uuid,
  add column if not exists snapshot_date date,
  add column if not exists next_retry_at timestamptz,
  add column if not exists llm_error text;

create index if not exists research_run_next_retry_idx
  on public.research_run (state, next_retry_at);

comment on column public.research_run.snapshot_id is
'Research snapshot row id persisted for this run so retries can resume generation without re-collecting providers.';

comment on column public.research_run.snapshot_date is
'UTC snapshot_date for this run. Used to load the persisted snapshot on retry.';

comment on column public.research_run.next_retry_at is
'When state is deferred, the earliest timestamp the worker should retry generation.';

comment on column public.research_run.llm_error is
'Last LLM error message (sanitized) when generation is deferred.';

commit;
