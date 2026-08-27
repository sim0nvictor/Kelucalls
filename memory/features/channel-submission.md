## Channel Submission & Moderation

**What it is:** `/listing-policy` — the public path for someone to request a new channel be tracked, plus the admin review queue behind it.

**How it works, end to end:**
1. A visitor fills `submission-form.tsx`. The insert into `submissions` always lands as `status = 'pending'` (enforced by RLS, not just the UI) and is optionally linked to their account if signed in.
2. An admin reviews it at `/kx-admin` via `getPendingSubmissions()`, approves or rejects.
3. Approval creates (or links) a row in `tracking_requests` — a small onboarding queue the *scraper* itself polls every 5 minutes.
4. The scraper's `processTrackingQueue()` resolves the Telegram handle, creates the `channels` row (or reuses an existing one), and immediately backfills the last ~100 historical messages so the channel isn't empty on day one.
5. From that point on, the channel is a normal tracked source, feeding Feature 1–4 like any other.

**Notable gap:** if the submitter was signed in, they can see their submission's status change on their own account page, but there's no dedicated in-app notification wired for "your submission was approved" specifically — that's a different mechanism from the KeluScore/watchlist alert pipeline.
