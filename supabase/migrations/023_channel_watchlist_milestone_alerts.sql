begin;

-- Add an idempotency key for worker-created notifications. A call can cross
-- several milestones, but each user should receive each call/milestone once.
alter table public.user_notifications
  add column if not exists dedupe_key text not null default gen_random_uuid()::text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'user_notifications_user_dedupe_unique'
       and conrelid = 'public.user_notifications'::regclass
  ) then
    alter table public.user_notifications
      add constraint user_notifications_user_dedupe_unique
      unique (user_id, dedupe_key);
  end if;
end
$$;

comment on column public.user_notifications.dedupe_key is
'Per-user idempotency key used by alert workers to prevent duplicate event notifications.';

create index if not exists user_alert_rules_channel_big_win_idx
  on public.user_alert_rules (channel_id, user_id)
  where rule_type = 'channel_big_win' and is_active = true;

-- Existing watchlists should receive the same defaults as newly followed
-- channels. Do not overwrite any alert rule a user has already customized.
insert into public.user_alert_rules (
  user_id,
  rule_type,
  channel_id,
  delivery_channels,
  conditions,
  is_active
)
select
  watch.user_id,
  'channel_big_win'::public.alert_rule_type,
  watch.channel_id,
  array['in_app']::public.alert_delivery_channel[],
  '{"milestones":[2,10,100],"source":"channel_watchlist"}'::jsonb,
  true
from public.user_channel_watchlist as watch
where not exists (
  select 1
  from public.user_alert_rules as existing
  where existing.user_id = watch.user_id
    and existing.channel_id = watch.channel_id
    and existing.rule_type = 'channel_big_win'
);

commit;
