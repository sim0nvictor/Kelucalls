## Channel Avatars

**What it is:** The profile photo shown next to each channel's name across the site.

**How it works:** New channel discovery and the rerunnable `channel-avatar-sync.js` worker fetch a public Telegram profile photo via the **Bot API** (`getChat` → `getFile`), download it at runtime, and upload it to the public Supabase Storage `assets` bucket. Only the stable Storage URL is written to `channels.avatar_url`; the token-bearing Telegram file URL never leaves the process. The worker is self-throttled, retries transient failures, detects unchanged photos with Telegram's `big_file_unique_id`, and isolates individual channel failures. The scraper itself authenticates as a regular user account (GramJS), not a bot, for reading messages.

The frontend's `ChannelAvatar` component displays the image when it loads and falls back to deterministic initials when the value is missing or the image fails. Images are lazy-loaded unless a caller explicitly marks one as priority.
