# Kelucalls Supabase Reset

## What changed

The old migration history was archived under `supabase/migrations/archive/`.

The new baseline is `supabase/migrations/001_kelucalls_baseline.sql`. It rebuilds the database in five layers:

1. Source: `channels`, `telegram_messages`
2. Intelligence: `tokens`, `calls`, `call_metrics`
3. Analytics: `channel_stats`, `trending_tokens`
4. Monetization: `ads`, `sponsored_placements`, `ad_impressions`, `ad_clicks`
5. Community/Admin: `submissions`, `moderation_reports`, `admin_users`, `admin_audit_logs`, `worker_runs`

## Root causes fixed

- Drifted migrations mixed resets, patches, and production state.
- Scraper/workers and schema diverged on column names and ownership.
- Analytics were partly modeled as public objects without a clear refresh boundary.
- Admin checks relied on privileged helpers instead of a simpler least-privilege shape.
- Raw ingestion and parsed intelligence were coupled, making replay and debugging harder.

## Security model

- `anon` and normal `authenticated` users only get public reads plus submission inserts.
- Raw telegram ingestion tables are not public.
- Admin access is controlled by `admin_users`.
- No analytics object uses `SECURITY DEFINER`.
- Scraper and workers are expected to use the Supabase service role key.

## Analytics strategy

- `channel_stats` stays a table to preserve PostgREST relationships used by the frontend.
- `trending_tokens` is a materialized view because it is read-heavy and public-safe.
- Workers should call `refresh_public_analytics()` after batches, or run direct SQL refreshes on a schedule.
- If concurrent refresh becomes necessary later, run `REFRESH MATERIALIZED VIEW CONCURRENTLY public.trending_tokens;` directly outside an RPC transaction.

## Reset / deploy sequence

1. Back up production data before any reset.
2. Apply `001_kelucalls_baseline.sql` to a fresh database or a deliberate reset environment.
3. Re-seed at least one `admin_users` row with a real `auth.users.id`.
4. Redeploy the scraper and workers from this repo so they target the rebuilt schema.
5. Run a first analytics refresh:

```sql
select public.refresh_public_analytics();
```

## Validation checklist

- Insert a raw `telegram_messages` row and confirm it is not visible to `anon`.
- Insert or scrape a call and verify `calls`, `call_metrics`, and `tokens` update correctly.
- Confirm `channel_stats` returns rows for active channels.
- Confirm `trending_tokens` contains only active/public-safe aggregates.
- Verify `anon` can read `channels`, `calls`, `tokens`, `channel_stats`, `trending_tokens`, and `ads`.
- Verify `anon` cannot read `submissions`, `telegram_messages`, or admin/internal tables.
