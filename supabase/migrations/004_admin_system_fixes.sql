begin;

-- ============================================================================
-- Admin System Fixes - Kelucalls
--
-- Fixes for the /kx-admin hidden admin system:
-- 1. Create ad-banners storage bucket
-- 2. Make ads.channel_id nullable (floating popup ads don't need a channel)
-- 3. Add placement_subtype column to sponsored_placements
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Storage bucket for ad banners
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('ad-banners', 'ad-banners', true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Make ads.channel_id nullable
-- The UI is designed for "floating popup ads" that don't require a channel.
-- This was incorrectly defined as NOT NULL in the baseline.
-- ----------------------------------------------------------------------------
alter table public.ads
alter column channel_id drop not null;

-- ----------------------------------------------------------------------------
-- Add placement_subtype to sponsored_placements
-- Used to distinguish between channel_placement and token_placement
-- ----------------------------------------------------------------------------
alter table public.sponsored_placements
add column if not exists placement_subtype text
default 'channel_placement';

-- Add token_symbol and contract_address for token placements
-- These were missing from the baseline but are used by the admin UI
alter table public.sponsored_placements
add column if not exists token_symbol text;

alter table public.sponsored_placements
add column if not exists contract_address text;

-- Relax the constraint to allow token_symbol + contract_address as alternative to token_id
-- The old constraint required either token_id or channel_id, but token placements
-- use token_symbol/contract_address instead of token_id
alter table public.sponsored_placements
drop constraint if exists sponsored_placements_target_chk;

alter table public.sponsored_placements
add constraint sponsored_placements_target_chk check (
  token_id is not null or channel_id is not null or token_symbol is not null
);

-- Create index for efficient filtering by subtype
create index if not exists sponsored_placements_subtype_idx
on public.sponsored_placements (placement_subtype)
where placement_subtype is not null;

-- ----------------------------------------------------------------------------
-- tracking_requests table
-- Used by the scraper to track Telegram channels that should be monitored.
-- Referenced by deleteChannelAction but was not in the baseline migration.
-- ----------------------------------------------------------------------------
create table if not exists public.tracking_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_handle text not null,
  telegram_url text,
  channel_name text,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending',
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tracking_requests_handle_unique unique (telegram_handle)
);

create index if not exists tracking_requests_status_idx
on public.tracking_requests (status, created_at desc);

create index if not exists tracking_requests_telegram_handle_idx
on public.tracking_requests (telegram_handle);

-- Enable RLS - service role only
alter table public.tracking_requests enable row level security;

create policy tracking_requests_service_role_all
  on public.tracking_requests
  for all
  to service_role
  using (true)
  with check (true);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.tracking_requests to service_role;

commit;