begin;

-- ============================================================================
-- Stable Asset Storage — Kelucalls (BL-005)
--
-- Creates ONE public bucket, `assets`, for non-sensitive public image assets:
--   - channel avatars  ->  channels/{channel_id}.{ext}
--   - token logos      ->  tokens/{chain}/{contract_address}.{ext}
--
-- These stable, self-hosted URLs (saved in channels.avatar_url / tokens.logo_url)
-- replace hotlinked/temporary external image URLs — most importantly the
-- temporary, token-bearing Telegram getFile URLs (which expire ~1h and leak the
-- bot token), and volatile DexScreener CDN URLs.
--
-- Reads : public. The bucket is public and its objects are non-sensitive images.
-- Writes: trusted server/worker code ONLY, via the service role key (which
--         bypasses RLS). No anon/authenticated write policy is defined, so the
--         browser can never write to this bucket.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- Public read of assets objects (explicit; consistent with the public bucket).
drop policy if exists "assets_public_read" on storage.objects;
create policy "assets_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'assets');

-- NOTE: intentionally NO insert/update/delete policies for bucket_id = 'assets'.
-- Writes are performed only by trusted server/worker code using the service role
-- key, which bypasses RLS. anon/authenticated clients therefore cannot write.

commit;
