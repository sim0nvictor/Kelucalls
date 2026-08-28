begin;

-- One durable execution record per UTC research date. The worker owns the
-- state transitions; service-role access keeps this internal.
create table if not exists public.research_run (
  id uuid primary key default gen_random_uuid(),
  run_date date not null unique,
  state text not null default 'pending',
  attempt integer not null default 1,
  started_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  duration_ms bigint,
  api_calls integer not null default 0,
  providers_succeeded text[] not null default '{}'::text[],
  providers_failed text[] not null default '{}'::text[],
  generated_report_id uuid,
  article_id uuid references public.articles(id) on delete set null,
  validation_result jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint research_run_state_chk check (state in ('pending', 'collecting', 'analyzing', 'generating', 'validating', 'draft', 'failed')),
  constraint research_run_attempt_chk check (attempt > 0),
  constraint research_run_api_calls_chk check (api_calls >= 0),
  constraint research_run_validation_object_chk check (jsonb_typeof(validation_result) = 'object')
);

drop trigger if exists research_run_set_updated_at on public.research_run;
create trigger research_run_set_updated_at
before update on public.research_run
for each row execute function public.set_updated_at();

create index if not exists research_run_state_updated_idx
  on public.research_run (state, updated_at desc);

alter table public.research_run enable row level security;

drop policy if exists research_run_service_role_all on public.research_run;
create policy research_run_service_role_all
  on public.research_run
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update on public.research_run to service_role;

comment on table public.research_run is
'Internal Daily Research pipeline execution state, provider outcomes, validation result, draft article, and timing metrics. One row per UTC run date prevents duplicate daily reports.';

commit;