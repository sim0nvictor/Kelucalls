-- Telegram bot service tables for Kelucalls.
-- The bot uses SUPABASE_SERVICE_ROLE_KEY and reads precomputed analytics only.

create extension if not exists pgcrypto;

create table if not exists public.telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger telegram_users_set_updated_at
before update on public.telegram_users
for each row execute function public.set_updated_at();

create table if not exists public.telegram_subscriptions (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null references public.telegram_users(id) on delete cascade,
  subscription_type text not null default 'all',
  channel_id uuid references public.channels(id) on delete set null,
  token_id uuid references public.tokens(id) on delete set null,
  chain text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_subscriptions_type_chk check (subscription_type in ('all', 'channel', 'token', 'chain')),
  constraint telegram_subscriptions_chain_chk check (chain is null or chain = lower(chain))
);

create trigger telegram_subscriptions_set_updated_at
before update on public.telegram_subscriptions
for each row execute function public.set_updated_at();

create unique index if not exists telegram_subscriptions_all_unique_idx
  on public.telegram_subscriptions (telegram_user_id, subscription_type)
  where subscription_type = 'all';

create index if not exists telegram_subscriptions_user_active_idx
  on public.telegram_subscriptions (telegram_user_id, is_active);

create index if not exists telegram_subscriptions_channel_idx
  on public.telegram_subscriptions (channel_id)
  where channel_id is not null and is_active = true;

create index if not exists telegram_subscriptions_token_idx
  on public.telegram_subscriptions (token_id)
  where token_id is not null and is_active = true;

create index if not exists telegram_subscriptions_chain_idx
  on public.telegram_subscriptions (chain)
  where chain is not null and is_active = true;

create table if not exists public.telegram_alert_preferences (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id uuid not null unique references public.telegram_users(id) on delete cascade,
  achievement_alerts_enabled boolean not null default true,
  smart_call_alerts_enabled boolean not null default true,
  min_score numeric(4, 3) not null default 0.700,
  chains text[] not null default '{}'::text[],
  verified_channels_only boolean not null default true,
  achievement_thresholds integer[] not null default array[2, 5, 10, 50, 100],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint telegram_alert_preferences_min_score_chk check (min_score >= 0 and min_score <= 1),
  constraint telegram_alert_preferences_thresholds_chk check (achievement_thresholds <@ array[2, 5, 10, 50, 100])
);

create trigger telegram_alert_preferences_set_updated_at
before update on public.telegram_alert_preferences
for each row execute function public.set_updated_at();

create index if not exists telegram_alert_preferences_enabled_idx
  on public.telegram_alert_preferences (smart_call_alerts_enabled, achievement_alerts_enabled);

create table if not exists public.bot_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  channel_id uuid references public.channels(id) on delete set null,
  call_id uuid references public.calls(id) on delete set null,
  token_id uuid references public.tokens(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bot_events_type_chk check (event_type in ('achievement', 'new_call', 'trending', 'coordinated_call')),
  constraint bot_events_attempts_chk check (attempts >= 0)
);

create trigger bot_events_set_updated_at
before update on public.bot_events
for each row execute function public.set_updated_at();

create index if not exists bot_events_unprocessed_idx
  on public.bot_events (created_at)
  where processed = false and attempts < 5;

create index if not exists bot_events_type_created_idx
  on public.bot_events (event_type, created_at desc);

create index if not exists bot_events_call_idx
  on public.bot_events (call_id)
  where call_id is not null;

create index if not exists bot_events_token_idx
  on public.bot_events (token_id)
  where token_id is not null;

create or replace function public.increment_bot_event_attempts(event_id uuid, error_message text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.bot_events
  set attempts = attempts + 1,
      last_error = error_message,
      updated_at = now()
  where id = event_id;
end;
$$;

alter table public.telegram_users enable row level security;
alter table public.telegram_subscriptions enable row level security;
alter table public.telegram_alert_preferences enable row level security;
alter table public.bot_events enable row level security;

create policy telegram_users_service_role_all
  on public.telegram_users
  for all
  to service_role
  using (true)
  with check (true);

create policy telegram_subscriptions_service_role_all
  on public.telegram_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

create policy telegram_alert_preferences_service_role_all
  on public.telegram_alert_preferences
  for all
  to service_role
  using (true)
  with check (true);

create policy bot_events_service_role_all
  on public.bot_events
  for all
  to service_role
  using (true)
  with check (true);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.telegram_users to service_role;
grant select, insert, update, delete on public.telegram_subscriptions to service_role;
grant select, insert, update, delete on public.telegram_alert_preferences to service_role;
grant select, insert, update, delete on public.bot_events to service_role;
grant execute on function public.increment_bot_event_attempts(uuid, text) to service_role;

comment on table public.bot_events is
'Queue of precomputed alert events. Workers insert rows; the Telegram bot sends notifications and marks them processed.';
