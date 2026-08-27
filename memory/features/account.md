## User Accounts & Auth

**What it is:** Sign-up/login, profile settings, and everything under `/account` — entirely separate machinery from the admin system (Feature 16).

**How it works:** Real Supabase Auth. On signup, a database trigger (`handle_new_user()`) automatically creates a matching `profiles` row, so the app never has to handle "logged in but no profile yet." Every server-side read of the current user (`getCurrentUser()`) calls Supabase's `getUser()`, never the cheaper `getSession()` — because `getSession()` trusts the session cookie's contents without re-verifying its signature against the auth server, which would let a forged cookie pass; `getUser()` actually validates it. A `preferences jsonb` bag on `profiles` (rather than dedicated columns) is where low-stakes settings like the notification master switch live, specifically so adding a new toggle never requires a migration.
