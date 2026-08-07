begin;

-- ============================================================================
-- Kelucalls user accounts layer
--
-- Adds the public-facing account system that sits alongside the existing
-- hidden admin system. Admin identity stays in public.admin_users; regular
-- visitors get public.profiles. Both point at auth.users, so a person can be
-- both without any special casing.
--
-- Design notes for future feature work:
--   * Every user-owned table carries user_id uuid -> auth.users(id) and an
--     RLS policy of the exact same shape (owner-only). Copy that pattern for
--     any new per-user feature and it will inherit correct security.
--   * user_alert_rules is deliberately generic: rule_type + a jsonb
--     conditions blob. New alert kinds are a new enum value, not a new table.
--   * profiles.preferences is a jsonb bag for low-value settings so that
--     adding a toggle does not require a migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'alert_delivery_channel') then
    create type public.alert_delivery_channel as enum ('in_app', 'email', 'telegram');
  end if;

  if not exists (select 1 from pg_type where typname = 'alert_rule_type') then
    create type public.alert_rule_type as enum (
      'channel_new_call',
      'channel_big_win',
      'token_trending',
      'watchlist_digest'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('pending', 'sent', 'read', 'failed');
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- One row per auth user. Created automatically by a trigger on signup so the
-- application never has to handle a missing profile.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext,
  display_name text,
  avatar_url text,
  bio text,
  telegram_handle citext,
  time_zone text not null default 'UTC',
  marketing_opt_in boolean not null default false,
  onboarding_completed_at timestamptz,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_username_key unique (username),
  constraint profiles_username_chk check (username is null or username::text ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_avatar_url_chk check (avatar_url is null or avatar_url ~* '^https?://'),
  constraint profiles_bio_chk check (bio is null or char_length(bio) <= 500),
  constraint profiles_display_name_chk check (display_name is null or char_length(display_name) <= 80)
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

comment on table public.profiles is
'Public user profile for every auth.users row. Auto-created on signup. Separate from admin_users.';

-- ----------------------------------------------------------------------------
-- Auto-provision a profile whenever a user signs up.
--
-- SECURITY DEFINER is required here because the trigger runs in the auth
-- schema context and must insert into public.profiles. search_path is pinned
-- to avoid the usual privilege-escalation footgun.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(btrim(coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )), ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
'Creates the public.profiles row for a new auth user. Idempotent.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for any users that already exist (e.g. current admins).
insert into public.profiles (id, display_name)
select u.id, split_part(coalesce(u.email, ''), '@', 1)
from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Channel watchlist (follow)
-- ----------------------------------------------------------------------------
create table if not exists public.user_channel_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  notes text,
  is_muted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_channel_watchlist_unique unique (user_id, channel_id),
  constraint user_channel_watchlist_notes_chk check (notes is null or char_length(notes) <= 500)
);

drop trigger if exists user_channel_watchlist_set_updated_at on public.user_channel_watchlist;
create trigger user_channel_watchlist_set_updated_at
before update on public.user_channel_watchlist
for each row execute function public.set_updated_at();

comment on table public.user_channel_watchlist is
'Channels a user follows. Drives the account watchlist page and alert fan-out.';

-- ----------------------------------------------------------------------------
-- Token watchlist (same shape as the channel watchlist on purpose)
-- ----------------------------------------------------------------------------
create table if not exists public.user_token_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_id uuid not null references public.tokens(id) on delete cascade,
  notes text,
  is_muted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_token_watchlist_unique unique (user_id, token_id),
  constraint user_token_watchlist_notes_chk check (notes is null or char_length(notes) <= 500)
);

drop trigger if exists user_token_watchlist_set_updated_at on public.user_token_watchlist;
create trigger user_token_watchlist_set_updated_at
before update on public.user_token_watchlist
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Alert rules
-- Generic on purpose. A new alert type is a new enum value plus a worker
-- branch, not a new table and not a new migration shape.
-- ----------------------------------------------------------------------------
create table if not exists public.user_alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_type public.alert_rule_type not null,
  channel_id uuid references public.channels(id) on delete cascade,
  token_id uuid references public.tokens(id) on delete cascade,
  delivery_channels public.alert_delivery_channel[] not null
    default array['in_app']::public.alert_delivery_channel[],
  conditions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  last_triggered_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_alert_rules_delivery_chk check (array_length(delivery_channels, 1) >= 1),
  constraint user_alert_rules_target_chk check (
    case rule_type
      when 'channel_new_call' then channel_id is not null
      when 'channel_big_win' then channel_id is not null
      when 'token_trending' then true
      when 'watchlist_digest' then true
    end
  )
);

drop trigger if exists user_alert_rules_set_updated_at on public.user_alert_rules;
create trigger user_alert_rules_set_updated_at
before update on public.user_alert_rules
for each row execute function public.set_updated_at();

comment on table public.user_alert_rules is
'Per-user alert subscriptions. rule_type + conditions jsonb keeps this extensible without schema churn.';

-- ----------------------------------------------------------------------------
-- Notification inbox
-- Written by workers, read by the account UI.
-- ----------------------------------------------------------------------------
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_rule_id uuid references public.user_alert_rules(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  token_id uuid references public.tokens(id) on delete set null,
  title text not null,
  body text,
  url text,
  status public.notification_status not null default 'pending',
  read_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_notifications_url_chk check (url is null or url ~ '^/' or url ~* '^https?://')
);

comment on table public.user_notifications is
'Delivered alert inbox. Workers insert via service role; users read and mark read.';

-- ----------------------------------------------------------------------------
-- Link submissions back to the account that made them
-- ----------------------------------------------------------------------------
alter table public.submissions
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;

comment on column public.submissions.submitted_by is
'Account that submitted this channel, when submitted while signed in. Null for anonymous submissions.';

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists profiles_username_idx
  on public.profiles (username)
  where username is not null;

create index if not exists user_channel_watchlist_user_idx
  on public.user_channel_watchlist (user_id, created_at desc);

create index if not exists user_channel_watchlist_channel_idx
  on public.user_channel_watchlist (channel_id);

create index if not exists user_token_watchlist_user_idx
  on public.user_token_watchlist (user_id, created_at desc);

create index if not exists user_token_watchlist_token_idx
  on public.user_token_watchlist (token_id);

create index if not exists user_alert_rules_user_idx
  on public.user_alert_rules (user_id, created_at desc);

create index if not exists user_alert_rules_dispatch_idx
  on public.user_alert_rules (rule_type, is_active, channel_id)
  where is_active = true;

create index if not exists user_notifications_inbox_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_unread_idx
  on public.user_notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists submissions_submitted_by_idx
  on public.submissions (submitted_by, created_at desc)
  where submitted_by is not null;

-- ----------------------------------------------------------------------------
-- Row-level security
--
-- Every policy below is the same owner-only shape. Reuse it verbatim for new
-- per-user tables.
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_channel_watchlist enable row level security;
alter table public.user_token_watchlist enable row level security;
alter table public.user_alert_rules enable row level security;
alter table public.user_notifications enable row level security;

-- profiles: owner full control, plus public read of non-sensitive identity.
drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all
  on public.profiles
  for all
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read
  on public.profiles
  for select
  to anon, authenticated
  using (username is not null);

-- watchlists
drop policy if exists user_channel_watchlist_owner_all on public.user_channel_watchlist;
create policy user_channel_watchlist_owner_all
  on public.user_channel_watchlist
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_token_watchlist_owner_all on public.user_token_watchlist;
create policy user_token_watchlist_owner_all
  on public.user_token_watchlist
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- alert rules
drop policy if exists user_alert_rules_owner_all on public.user_alert_rules;
create policy user_alert_rules_owner_all
  on public.user_alert_rules
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- notifications: users read and mark their own read. Inserts are service role.
drop policy if exists user_notifications_owner_read on public.user_notifications;
create policy user_notifications_owner_read
  on public.user_notifications
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_notifications_owner_update on public.user_notifications;
create policy user_notifications_owner_update
  on public.user_notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- submissions: let a signed-in user see the ones they filed.
drop policy if exists submissions_owner_read on public.submissions;
create policy submissions_owner_read
  on public.submissions
  for select
  to authenticated
  using (submitted_by is not null and submitted_by = auth.uid());

-- Re-create the public insert policy so a user cannot forge submitted_by.
drop policy if exists submissions_public_insert on public.submissions;
create policy submissions_public_insert
  on public.submissions
  for insert
  to anon, authenticated
  with check (
    status = 'pending'
    and approved_channel_id is null
    and review_notes is null
    and (submitted_by is null or submitted_by = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- Grants
-- RLS does the real gating; these grants just open the door for authenticated.
-- ----------------------------------------------------------------------------
grant select on public.profiles to anon, authenticated;
grant insert, update, delete on public.profiles to authenticated;

grant select, insert, update, delete on public.user_channel_watchlist to authenticated;
grant select, insert, update, delete on public.user_token_watchlist to authenticated;
grant select, insert, update, delete on public.user_alert_rules to authenticated;

grant select, update on public.user_notifications to authenticated;

grant select on public.submissions to authenticated;

commit;
