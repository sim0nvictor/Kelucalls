begin;

-- ============================================================================
-- KeluScore alerts (Phase 3)
--
-- Additive only. No table is created here: this reuses the generic alert
-- system from 005 exactly as that migration intended ("New alert kinds are a
-- new enum value, not a new table").
--
-- Data flow:
--   workers/intent-engine.js  -> score_changes   (already exists)
--     -> workers/intent-alerts.js                (new)
--       -> user_notifications                    (already exists)
--
-- POSTGRES GOTCHA, PLEASE READ:
--   "alter type ... add value" cannot have its new value USED in the same
--   transaction that adds it. Nothing below references 'token_intent_spike'
--   as an enum literal in an expression, which is why this file is safe to
--   run as one script. If your client still rejects it, run the single
--   "alter type" statement on its own first, then run the rest of the file.
-- ============================================================================

alter type public.alert_rule_type add value if not exists 'token_intent_spike';

-- ----------------------------------------------------------------------------
-- Make the target check tolerate future rule types.
--
-- The 005 version was a case expression naming all four rule types with no
-- else branch. A new rule type fell through to NULL, and a CHECK that
-- evaluates to NULL is treated as satisfied, so this was never a hard
-- blocker. It was still a trap: the next person adding a rule type would have
-- to know that rule to feel safe. Made explicit instead.
--
-- Behaviour for the existing four types is unchanged. token_trending and
-- watchlist_digest were already unconstrained, so folding them into the else
-- branch is a no-op.
-- ----------------------------------------------------------------------------
alter table public.user_alert_rules
  drop constraint if exists user_alert_rules_target_chk;

alter table public.user_alert_rules
  add constraint user_alert_rules_target_chk check (
    case rule_type
      when 'channel_new_call' then channel_id is not null
      when 'channel_big_win' then channel_id is not null
      else true
    end
  );

-- ----------------------------------------------------------------------------
-- Dispatch bookkeeping on score_changes.
--
-- The alert worker needs to know which rows it has already fanned out. A
-- nullable timestamp is enough and stays useful for debugging ("when did this
-- go out?"), which a boolean would not.
-- ----------------------------------------------------------------------------
alter table public.score_changes
  add column if not exists notified_at timestamptz;

comment on column public.score_changes.notified_at is
'Set once workers/intent-alerts.js has fanned this change out. NULL means pending dispatch.';

-- Partial index: the dispatch query only ever looks at unprocessed rows, and
-- that set stays small even as score_changes grows without bound.
create index if not exists score_changes_pending_idx
  on public.score_changes (created_at)
  where notified_at is null;

-- ----------------------------------------------------------------------------
-- Backfill.
--
-- Every score_change that exists today predates alerting. Marking them
-- dispatched stops the worker's first run from flooding every subscriber with
-- a backlog of historical movements.
-- ----------------------------------------------------------------------------
update public.score_changes
   set notified_at = timezone('utc', now())
 where notified_at is null;

commit;
