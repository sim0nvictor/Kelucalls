# User accounts

How the public account system works, and how to extend it.

This is separate from the admin system in `src/lib/admin/` and `src/app/kx-admin/`.
Both authenticate against Supabase, but they use different cookies, different
session handling and different tables. Do not merge them.

---

## Why the old login did not work

`/login` existed as a concept but there was never a page behind it, and
`middleware.ts` contained this:

```ts
if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/login") {
  return NextResponse.redirect(new URL("/", request.url));
}
```

Every request to `/login` was 307'd to the homepage before it could render.
That redirect has been removed for `/login`; `/admin` still bounces, since the
real admin surface lives at `/kx-admin`.

---

## Layout

```
src/lib/auth/          session + client plumbing (public users)
  constants.ts         all auth paths, safeNextPath() open-redirect guard
  errors.ts            AuthErrorCode taxonomy + AuthActionState
  supabase-browser.ts  createBrowserClient (cookie-writing)
  supabase-server.ts   createServerClient bound to the Next cookie store
  session.ts           getCurrentUser / getCurrentProfile / requireUser

src/lib/account/       account feature data layer
  queries.ts           cached reads (watchlist, alerts, submissions, inbox)
  actions.ts           writes (follow, alert rules, profile)

src/app/(auth)/        login, signup, forgot-password, reset-password
src/app/auth/          callback + sign-out route handlers
src/app/account/       the signed-in area
```

---

## Session handling

Uses `@supabase/ssr`, not hand-rolled cookies.

The admin flow stores an access token, a refresh token and an expiry in three
separate cookies, then never uses the refresh token. When the access token
expires (about an hour) the admin is silently signed out. The public system
avoids this: `middleware.ts` calls `supabase.auth.getUser()` on every request,
which rotates the token and writes fresh cookies onto the response.

Two rules:

1. **Always `getUser()`, never `getSession()`** in server code. `getSession()`
   trusts the cookie without verifying the JWT signature.
2. **Never use `src/lib/supabase/server.ts` for user requests.** That client
   holds the service role key and bypasses RLS entirely.

---

## Error handling

Server actions return an `AuthActionState`, not a redirect with `?error=`.

The admin action wraps everything in one `catch` and reports
`Invalid credentials`, so a missing environment variable is indistinguishable
from a typo'd password. `src/lib/auth/errors.ts` maps failures to distinct
codes instead:

| Code | Means |
| --- | --- |
| `invalid_credentials` | Wrong email or password |
| `email_not_confirmed` | Account exists, link not clicked |
| `email_taken` | Signup against an existing address |
| `weak_password` | Below the minimum length |
| `rate_limited` | Supabase throttled us |
| `not_configured` | **Server problem.** Env vars missing |
| `expired_link` | Confirmation or recovery link is stale |
| `unknown` | Unmapped; logged server side with the original error |

`not_configured` is the important one. It is never shown as a credential error.

---

## Database

Migration: `supabase/migrations/005_user_accounts.sql`

| Table | Purpose |
| --- | --- |
| `profiles` | One row per `auth.users` row, auto-created by trigger |
| `user_channel_watchlist` | Channels a user follows |
| `user_token_watchlist` | Tokens a user follows |
| `user_alert_rules` | Alert subscriptions |
| `user_notifications` | Delivered alert inbox |

`submissions` gains a nullable `submitted_by` column so a signed-in user can
track what they submitted. Anonymous submissions still work.

Every user-owned table follows the same shape:

```sql
user_id uuid not null references auth.users(id) on delete cascade
```

with one owner-only policy:

```sql
create policy <table>_owner_all on public.<table>
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

Copy that pattern for any new per-user table and it inherits correct security.

---

## Adding a feature

**A new account page**

1. Add `src/app/account/<name>/page.tsx`
2. Add an entry to `ACCOUNT_LINKS` in `src/components/account/account-nav.tsx`

The layout calls `requireUser()`, so the page is protected automatically.

**A new alert type**

1. `alter type public.alert_rule_type add value '<name>';`
2. Add a label to `RULE_LABELS` in `src/app/account/alerts/page.tsx`
3. Handle it in the worker that fans out notifications

No new table, no new action.

**A new per-user table**

Follow the `user_channel_watchlist` block in migration 005 verbatim: same
`user_id` column, same RLS policy, same grants. Then add a read to
`src/lib/account/queries.ts` and a write to `src/lib/account/actions.ts`.

**A follow button anywhere**

```tsx
import { FollowChannelButton } from "@/components/account/follow-channel-button";
import { getFollowedChannelIds } from "@/lib/account/queries";
import { getCurrentUser } from "@/lib/auth/session";

const [user, followedIds] = await Promise.all([
  getCurrentUser(),
  getFollowedChannelIds()
]);

<FollowChannelButton
  channelId={channel.id}
  initialFollowing={followedIds.has(channel.id)}
  isSignedIn={Boolean(user)}
/>
```

Signed-out users get sent to `/login?next=<current page>` rather than a dead end.

---

## Deploy checklist

1. `npm install` (adds `@supabase/ssr`)
2. Run `supabase/migrations/005_user_accounts.sql` against the database
3. Confirm `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in Railway.
   `isSupabaseConfigured()` in `src/lib/server-env.ts` does **not** check it,
   so a missing anon key will not show up in existing health checks.
4. In the Supabase dashboard:
   - Authentication - Providers: enable Email
   - Authentication - URL Configuration: set Site URL to the production URL
   - Add `<site>/auth/callback` to the redirect allowlist

---

## Known gaps

- The admin login still has its own separate problems (single error message,
  no token refresh, in-memory rate limiter). Tracked separately.
- Alert rules can be viewed and toggled but the fan-out worker that writes
  `user_notifications` is not built yet.
- Token watchlist has schema and queries but no UI.
- OAuth providers are not wired up. Adding one is a Supabase dashboard change
  plus a button that calls `signInWithOAuth`; the callback route already
  handles the PKCE exchange.
