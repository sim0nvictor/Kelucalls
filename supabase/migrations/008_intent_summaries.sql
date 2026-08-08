begin;

-- ============================================================================
-- KeluScore AI summaries (Phase 3)
--
-- Additive only. One new table, nothing existing is altered.
--
-- Why a separate table instead of columns on intent_scores:
--   intent_scores is upserted every cycle by workers/intent-engine.js. Putting
--   summary text in that row couples an expensive, rate-limited, occasionally
--   failing external call to the hot scoring path. Keeping it separate means a
--   dead OpenAI key can never block a score from being written.
--
-- Data flow:
--   intent_scores (existing)
--     -> workers/intent-summaries.js  (new, calls an LLM over HTTPS)
--       -> intent_summaries           (this table)
--
-- The summary is CACHED, never generated at request time. Page loads read a
-- row; they never wait on a model.
-- ============================================================================

create table if not exists public.intent_summaries (
  token_id uuid primary key references public.tokens(id) on delete cascade,

  summary text not null,
  model text not null,

  -- Bumped when the prompt changes, so old summaries can be identified and
  -- regenerated without guessing which template produced them.
  prompt_version integer not null default 1,

  -- The KeluScore this summary was written about. Lets the worker detect that
  -- a summary is stale in SUBSTANCE, not merely old.
  score_at_generation numeric(6,2),

  generated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint intent_summaries_summary_chk check (char_length(summary) between 1 and 2000)
);

drop trigger if exists intent_summaries_set_updated_at on public.intent_summaries;
create trigger intent_summaries_set_updated_at
before update on public.intent_summaries
for each row execute function public.set_updated_at();

comment on table public.intent_summaries is
'Cached LLM narrative per token. Written only by workers/intent-summaries.js. Read-only for the app.';

comment on column public.intent_summaries.score_at_generation is
'KeluScore when the summary was written. Used to decide when regeneration is worth the API cost.';

create index if not exists intent_summaries_generated_idx
  on public.intent_summaries (generated_at desc);

-- ----------------------------------------------------------------------------
-- Row-level security: same shape as intent_scores. Public product data, but
-- writable only by the service role the worker uses.
-- ----------------------------------------------------------------------------
alter table public.intent_summaries enable row level security;

drop policy if exists intent_summaries_public_read on public.intent_summaries;
create policy intent_summaries_public_read
  on public.intent_summaries
  for select
  to anon, authenticated
  using (true);

grant select on public.intent_summaries to anon, authenticated;

commit;
