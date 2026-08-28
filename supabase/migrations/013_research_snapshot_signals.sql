begin;

-- ============================================================================
-- Deterministic Signal Engine output
--
-- Stores the structured signals the engine emits for each daily research
-- cycle. Every signal is computed in code from the snapshot's own provider
-- payloads; no LLM is asked to derive any score, confidence, or metric.
-- ============================================================================

alter table public.research_snapshots
  add column if not exists signals jsonb;

alter table public.research_snapshots
  drop constraint if exists research_snapshots_signals_object_chk;

alter table public.research_snapshots
  add constraint research_snapshots_signals_object_chk
    check (signals is null or jsonb_typeof(signals) = 'object');

comment on column public.research_snapshots.signals is
'Deterministic Signal Engine output. One block per snapshot: generatedAt, baselineSnapshotDate, signalCount, and a list of signals (signal_type, direction, score 0-100, confidence low|medium|high, supporting_metrics, timestamp, source_references). All values are computed deterministically from this row''s own provider payloads; the engine never calls an LLM.';

create index if not exists research_snapshots_signals_gin_idx
  on public.research_snapshots
  using gin (signals jsonb_path_ops);

commit;
