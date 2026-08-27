## Channel Avatars

**What it is:** The profile photo shown next to each channel's name across the site.

**How it works:** A standalone, manually-run (or weekly-cron) script, `channel-avatar-sync.js`, fetches each channel's public Telegram profile photo via the **Bot API** (`getChat` → `getFile` → build a CDN URL) and writes it to `channels.avatar_url`, self-throttled to roughly Telegram's rate limit. Note this is the *only* place in the system that uses the Bot API directly — the scraper itself authenticates as a regular user account (GramJS), not a bot, for reading messages.
