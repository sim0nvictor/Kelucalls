## Telegram Bot Alerts (`@KeluCallsAlerts_bot`)

**What it is:** A separate, push-based delivery channel — alerts arrive as a Telegram DM, independent of whether the person ever opens the website.

**How it works:** Any worker that detects a notable event (achievement milestone, new call, trending token, coordinated multi-channel call) inserts a row into `bot_events`. The bot process (built on Telegraf, distinct from the scraper's GramJS client — this one only sends, never listens for calls) consumes the queue, sends the Telegram message, and marks the row processed, retrying via a dedicated RPC on failure (capped at 5 attempts). A user manages what they're subscribed to (`all`, or specific channels/tokens/chains) and their thresholds (minimum score, verified-channels-only, which achievement tiers) entirely within Telegram, stored in `telegram_subscriptions`/`telegram_alert_preferences`.

**Important nuance:** this is a fully separate identity system from the website account — a person's Telegram bot preferences and their website `user_alert_rules` aren't linked by any foreign key in the schema. Someone using both surfaces manages them independently.
