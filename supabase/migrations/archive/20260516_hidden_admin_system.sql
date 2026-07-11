begin;

create extension if not exists pgcrypto;

alter table if exists public.admin_users
  add column if not exists role text not null default 'admin',
  add column if not exists invited_by uuid references auth.users(id) on delete set null,
  add column if not exists last_login_at timestamptz;

alter table if exists public.admin_users
  drop constraint if exists admin_users_role_chk;

alter table if exists public.admin_users
  add constraint admin_users_role_chk
  check (role in ('super_admin', 'admin', 'analyst', 'moderator'));

alter table if exists public.ads
  add column if not exists image_path text,
  add column if not exists image_alt text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists impression_tracking_enabled boolean not null default true,
  add column if not exists click_tracking_enabled boolean not null default true;

create table if not exists public.sponsored_placements (
  id uuid primary key default gen_random_uuid(),
  token_id uuid references public.tokens(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  title text not null,
  subtitle text,
  destination_url text not null,
  surface text not null,
  placement_type text not null,
  slot_key text not null,
  image_url text,
  badge_label text,
  priority integer not null default 100,
  status public.ad_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsored_placements_destination_url_chk check (destination_url ~* '^https?://'),
  constraint sponsored_placements_image_url_chk check (image_url is null or image_url ~* '^https?://'),
  constraint sponsored_placements_surface_chk check (surface in ('homepage', 'trending', 'tokens', 'live_feed')),
  constraint sponsored_placements_type_chk check (placement_type in ('featured_token', 'project_spotlight', 'homepage_slot', 'trending_boost')),
  constraint sponsored_placements_priority_chk check (priority >= 0),
  constraint sponsored_placements_target_chk check (token_id is not null or channel_id is not null),
  constraint sponsored_placements_ends_at_chk check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.ad_impressions (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references public.ads(id) on delete cascade,
  sponsored_placement_id uuid references public.sponsored_placements(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  page_path text,
  referrer text,
  session_id text,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  constraint ad_impressions_target_chk check (
    (ad_id is not null and sponsored_placement_id is null)
    or (ad_id is null and sponsored_placement_id is not null)
  )
);

create table if not exists public.ad_clicks (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid references public.ads(id) on delete cascade,
  sponsored_placement_id uuid references public.sponsored_placements(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  page_path text,
  referrer text,
  session_id text,
  ip_hash text,
  user_agent text,
  destination_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint ad_clicks_target_chk check (
    (ad_id is not null and sponsored_placement_id is null)
    or (ad_id is null and sponsored_placement_id is not null)
  ),
  constraint ad_clicks_destination_url_chk check (destination_url ~* '^https?://')
);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.submissions(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  token_id uuid references public.tokens(id) on delete set null,
  report_type text not null,
  reason text not null,
  details text,
  reporter_email text,
  status text not null default 'open',
  resolution_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_reports_status_chk check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  constraint moderation_reports_target_chk check (
    submission_id is not null or channel_id is not null or token_id is not null
  )
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

create trigger sponsored_placements_set_updated_at
  before update on public.sponsored_placements
  for each row execute function public.set_updated_at();

create trigger moderation_reports_set_updated_at
  before update on public.moderation_reports
  for each row execute function public.set_updated_at();

create index if not exists sponsored_placements_surface_schedule_idx
  on public.sponsored_placements (surface, status, priority asc, starts_at desc);

create index if not exists sponsored_placements_token_idx
  on public.sponsored_placements (token_id, starts_at desc)
  where token_id is not null;

create index if not exists sponsored_placements_channel_idx
  on public.sponsored_placements (channel_id, starts_at desc)
  where channel_id is not null;

create index if not exists ad_impressions_ad_occurred_idx
  on public.ad_impressions (ad_id, occurred_at desc)
  where ad_id is not null;

create index if not exists ad_impressions_placement_occurred_idx
  on public.ad_impressions (sponsored_placement_id, occurred_at desc)
  where sponsored_placement_id is not null;

create index if not exists ad_clicks_ad_occurred_idx
  on public.ad_clicks (ad_id, occurred_at desc)
  where ad_id is not null;

create index if not exists ad_clicks_placement_occurred_idx
  on public.ad_clicks (sponsored_placement_id, occurred_at desc)
  where sponsored_placement_id is not null;

create index if not exists moderation_reports_status_created_at_idx
  on public.moderation_reports (status, created_at desc);

create index if not exists admin_audit_logs_admin_created_at_idx
  on public.admin_audit_logs (admin_user_id, created_at desc);

create index if not exists admin_audit_logs_entity_idx
  on public.admin_audit_logs (entity_type, entity_id, created_at desc);

create or replace function public.log_admin_audit_event(
  target_action text,
  target_entity_type text,
  target_entity_id uuid default null,
  target_summary text default null,
  target_payload jsonb default '{}'::jsonb,
  target_ip_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Admin audit logging requires an authenticated user.';
  end if;

  if not public.is_admin() then
    raise exception 'Admin audit logging requires admin privileges.';
  end if;

  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    summary,
    payload,
    ip_hash
  )
  values (
    auth.uid(),
    target_action,
    target_entity_type,
    target_entity_id,
    target_summary,
    coalesce(target_payload, '{}'::jsonb),
    target_ip_hash
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

alter table if exists public.sponsored_placements enable row level security;
alter table if exists public.ad_impressions enable row level security;
alter table if exists public.ad_clicks enable row level security;
alter table if exists public.moderation_reports enable row level security;
alter table if exists public.admin_audit_logs enable row level security;

drop policy if exists "sponsored_placements_public_read" on public.sponsored_placements;
create policy "sponsored_placements_public_read"
  on public.sponsored_placements for select
  to anon, authenticated
  using (
    status = 'active'
    and starts_at <= now()
    and (ends_at is null or ends_at > now())
  );

drop policy if exists "sponsored_placements_admin_read_all" on public.sponsored_placements;
create policy "sponsored_placements_admin_read_all"
  on public.sponsored_placements for select
  to authenticated
  using (public.is_admin());

drop policy if exists "sponsored_placements_admin_insert" on public.sponsored_placements;
create policy "sponsored_placements_admin_insert"
  on public.sponsored_placements for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "sponsored_placements_admin_update" on public.sponsored_placements;
create policy "sponsored_placements_admin_update"
  on public.sponsored_placements for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "sponsored_placements_admin_delete" on public.sponsored_placements;
create policy "sponsored_placements_admin_delete"
  on public.sponsored_placements for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "ad_impressions_admin_read_all" on public.ad_impressions;
create policy "ad_impressions_admin_read_all"
  on public.ad_impressions for select
  to authenticated
  using (public.is_admin());

drop policy if exists "ad_impressions_admin_insert" on public.ad_impressions;
create policy "ad_impressions_admin_insert"
  on public.ad_impressions for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "ad_clicks_admin_read_all" on public.ad_clicks;
create policy "ad_clicks_admin_read_all"
  on public.ad_clicks for select
  to authenticated
  using (public.is_admin());

drop policy if exists "ad_clicks_admin_insert" on public.ad_clicks;
create policy "ad_clicks_admin_insert"
  on public.ad_clicks for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "moderation_reports_admin_read_all" on public.moderation_reports;
create policy "moderation_reports_admin_read_all"
  on public.moderation_reports for select
  to authenticated
  using (public.is_admin());

drop policy if exists "moderation_reports_admin_insert" on public.moderation_reports;
create policy "moderation_reports_admin_insert"
  on public.moderation_reports for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "moderation_reports_admin_update" on public.moderation_reports;
create policy "moderation_reports_admin_update"
  on public.moderation_reports for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "moderation_reports_admin_delete" on public.moderation_reports;
create policy "moderation_reports_admin_delete"
  on public.moderation_reports for delete
  to authenticated
  using (public.is_admin());

drop policy if exists "admin_audit_logs_admin_read_all" on public.admin_audit_logs;
create policy "admin_audit_logs_admin_read_all"
  on public.admin_audit_logs for select
  to authenticated
  using (public.is_admin());

drop policy if exists "admin_audit_logs_admin_insert" on public.admin_audit_logs;
create policy "admin_audit_logs_admin_insert"
  on public.admin_audit_logs for insert
  to authenticated
  with check (public.is_admin());

grant select, insert, update, delete on public.sponsored_placements to authenticated;
grant select, insert on public.ad_impressions to authenticated;
grant select, insert on public.ad_clicks to authenticated;
grant select, insert, update, delete on public.moderation_reports to authenticated;
grant select, insert on public.admin_audit_logs to authenticated;

grant select on public.sponsored_placements to anon;

insert into storage.buckets (id, name, public)
values ('admin-assets', 'admin-assets', true)
on conflict (id) do nothing;

drop policy if exists "admin_assets_admin_read" on storage.objects;
create policy "admin_assets_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'admin-assets' and public.is_admin());

drop policy if exists "admin_assets_admin_insert" on storage.objects;
create policy "admin_assets_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'admin-assets' and public.is_admin());

drop policy if exists "admin_assets_admin_update" on storage.objects;
create policy "admin_assets_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'admin-assets' and public.is_admin())
  with check (bucket_id = 'admin-assets' and public.is_admin());

drop policy if exists "admin_assets_admin_delete" on storage.objects;
create policy "admin_assets_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'admin-assets' and public.is_admin());

commit;
