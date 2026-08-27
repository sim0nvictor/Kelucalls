# Kelucalls — Scraper Architecture

## 1. What it is

A single long-running Node process using **GramJS** (`telegram` npm package, not Telegraf — that's the separate outbound bot in `apps/bot`). It logs in as a **real Telegram user account** (via `TelegramClient` + a saved `StringSession`), joins/watches the channels Kelucalls tracks, and both backfills history and listens live for new messages. It never sends messages — it's read-only against Telegram, but a full read/write client against Supabase (`service_role` key, `autoRefreshToken: false, persistSession: false` since it's a long-lived script, not a browser session).

Run with `npm run scraper` → `node scraper/index.js`. Authenticated once via `npm run scraper:login` → `node scraper/login.js`.

## 2. Session bootstrapping (`login.js` + `scraper-env.js`)

`login.js` is a **one-time interactive setup script**, run manually, never as part of the daemon:
1. Loads env via `loadScraperEnv()` — walks up from the script's directory until it finds a `package.json` (`findProjectRoot()`), then loads `.env` from there. This means the scraper doesn't depend on `cwd` — it can be launched from any directory and still finds the right `.env`.
2. Logs a masked status of every env var it cares about (`logScraperEnvStatus()` — shows `set (ab***yz)` or `missing`, never the raw value) plus a URL-format sanity check for the Supabase URLs (`reportSupabaseEnvFormatting()`).
3. Calls `validateScraperEnv({ requireSession: false })` — deliberately skips the session-var check since the whole point of this script is to *create* that session.
4. Starts a fresh `TelegramClient` with an **empty** `StringSession`, then calls `client.start()` with three interactive prompts (via the `input` package): phone number, 2FA password, SMS/Telegram code.
5. On success, prints `client.session.save()` — a serialized session string the operator must manually copy into `.env` as `TELEGRAM_SCRAPER_SESSION`.

**`scraper-env.js` is the shared env module** used by both `login.js` and `index.js`:
- `REQUIRED_TELEGRAM_ENV = [TELEGRAM_API_ID, TELEGRAM_API_HASH]`; Supabase vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) are required only when `requireSupabase: true`.
- `validateScraperEnv({ requireSupabase, requireSession, allowLegacySession })` — the daemon (`index.js`) calls this with `requireSupabase: true, allowLegacySession: false`, meaning it will refuse to start without `TELEGRAM_SCRAPER_SESSION` specifically (the older `TELEGRAM_SESSION` var name is recognized elsewhere for diagnostics but not accepted as a silent fallback in the daemon path).
- Every missing/misconfigured var produces one combined `Error` listing *all* missing names at once (not a fail-on-first-missing loop), and points at the resolved `.env` path so a wrong-directory launch is diagnosable from the error message alone.
- `TELEGRAM_API_ID` is explicitly re-validated as a positive integer after being read as a string from `process.env`.

## 3. Startup sequence (`index.js` `main()`)

1. `loadScraperEnv()` / `logScraperEnvStatus()` — same masked-logging boot as above.
2. Dynamic `import("telegram/events/index.js")` for `NewMessage` — done as a dynamic import rather than a static one (kept separate from the top-level GramJS import).
3. `validateScraperEnv({ requireSupabase: true, allowLegacySession: false })` — hard-fails fast if Telegram or Supabase env is incomplete, or if no `TELEGRAM_SCRAPER_SESSION` exists.
4. Creates the module-level `supabase` client once (service role, no session persistence) and a `TelegramClient` with `connectionRetries: 5`.
5. `client.connect()` — wrapped in a try/catch that specifically detects Telegram's `AUTH_KEY_DUPLICATED` error and rethrows a **human-actionable message**: stop other processes sharing this session, then regenerate one via `scraper:login`. This is Telegram's way of saying two processes are using the same user session simultaneously, which it doesn't allow.
6. `loadTrackedChannels()` — loads every `channels` row with `status IN ('active','paused')`.
7. **Startup backfill** — for every loaded channel, `backfillChannel(client, channel, 50)` pulls the last 50 messages via `client.getMessages()` and runs each through the same `handleMessage()` used for live traffic, so a freshly (re)started scraper doesn't sit idle waiting for new organic posts.
8. **Three recurring timers are set up**, all independent of each other:
   - Every 5 minutes: `loadTrackedChannels()` re-runs, refreshing the in-memory `channels` array (picks up channels added to the DB by an admin or by the tracking queue without restarting the process).
   - Immediately, then every 5 minutes: `processTrackingQueue(client)` (see §5).
   - *(Also, redundantly: a `setTimeout` at 30s that calls `processTrackingQueue` once and then sets up a second identical 5-minute interval for it — this appears to be leftover/duplicated logic rather than intentional double-processing; worth knowing if debugging duplicate queue-processing behavior.)*
9. **Live listener** — `client.addEventHandler(handler, new NewMessage({}))` — this is the actual real-time ingestion path, described in §4.
10. `SIGTERM`/`SIGINT` handlers call `client.disconnect()` before `process.exit(0)` for a clean shutdown (important because of the `AUTH_KEY_DUPLICATED` failure mode above — an unclean shutdown can leave the session in a state that fights the next start).
11. The whole `main()` is wrapped: `main().catch(err => { LOG.error(...); process.exit(1) })` — any unhandled startup error kills the process with a logged stack trace rather than hanging.

## 4. Live message handling — channel matching + parsing

The event handler registered on `NewMessage({})` fires for **every** new message the logged-in Telegram account can see (not filtered at the GramJS level), so channel matching happens in application code:

1. Bail if there's no `message.message` (text) or no `peerId`.
2. Build a lookup map (`buildHandleMap`) from normalized `telegram_handle` (lowercased, `@` stripped) to the in-memory channel row — rebuilt from the current `channels` array on every event (cheap, and always reflects the latest 5-minute refresh).
3. **Match by peer ID first**: if `peer.className === "PeerChannel"`, compare `peer.channelId` against each channel's stored `telegram_peer_id`. This is the fast, reliable path — no network call.
4. **Fallback to entity resolution**: if no peer-ID match, call `client.getEntity(peer)` (a Telegram API round trip) to resolve the username, then look it up in the handle map. Any error here (e.g. can't resolve) causes the whole event to be silently dropped (`return` inside a catch) — a message from an unmatched/untracked chat is simply not an error case.
5. If still unmatched, the message is ignored — this is how the scraper avoids processing traffic from every group the login account happens to be in, restricting itself to rows actually present in `channels`.
6. Matched messages go to `handleMessage(channelId, message)`.

`handleMessage()`:
1. Skip if text is empty or under 10 characters.
2. `parseCallMessage(text)` — the actual call-detection logic (§5 in the backend doc gives the summary; full detail below in §5 of this doc). Returns `null` (silently, at debug log level only) if nothing looks like a call.
3. `fetchDexScreenerData(contractAddress)` for entry price + logo in one request.
4. `upsertToken()` then `insertCall()`.

## 5. Call-detection parser (`parseCallMessage`) — the core heuristic engine

This is the most intricate piece of logic in the whole codebase. It runs a strict **priority cascade** — the first source that yields a contract address wins, later checks are skipped entirely once one succeeds:

| Priority | Source | Pattern | Chain resolution |
|---|---|---|---|
| 1 | GMGN.ai link | `gmgn\.ai/([a-z]+)/token/([^\s/?"]+)` | From URL path segment (`sol`→solana, `eth`→ethereum, `bsc`/`bnb`→bsc, `arb`→arbitrum, etc. via `chainFromUrlSegment()`) |
| 2 | Dexscreener link | `dexscreener\.com/([a-z]+)/([^\s/?"]+)` | Same URL-segment mapping |
| 3 | Pump.fun link | `pump\.fun/([1-9A-HJ-NP-Za-km-z]{32,44})` | Always `solana` (Pump.fun is Solana-only) |
| 4 | Explicit `CA:`/`Contract:`/`Contract Address:` label | `(?:ca\|contract(?:\s+address)?)\s*[:-]\s*([^\s\n]{20,})` | Runs `detectChain()` on the extracted string |
| 5 | Sui address (checked before generic EVM to avoid false positives) | `0x` + 64 hex chars | Always `sui` |
| 6 | Tron address | `T` + 33 base58 chars | Always `tron` |
| 7 | Generic EVM address | `0x` + 40 hex chars | `detectChain()` scans the message text for chain-name keywords (`base`, `arbitrum`/`arb`, `polygon`/`matic`, `avalanche`/`avax`, `bsc`/`binance smart chain`/`bnb chain`, `ethereum`/`eth`/`erc-?20`); defaults to `ethereum` if no keyword matches |
| 8 | Generic Solana base58 address (last resort — highest false-positive risk) | 32–44 char base58, filtered to reject anything under 32 chars or matching `^(https?\|www\|com\|org\|net)$` | Always `solana` |

Symbol extraction is separate from address extraction and always runs: checks a `Ticker: $SYMBOL` / `Ticker: SYMBOL` label first (`TICKER_LABEL_RE`), then falls back to the first `$SYMBOL` mention anywhere in the text (`SYMBOL_RE`, 2–12 uppercase letters).

**Acceptance rule** — a message is only treated as a call if:
- It has *either* a symbol or a contract address (neither → `null`, not a call), **and**
- If there's a symbol but no contract address, the symbol must be in `WELL_KNOWN_SYMBOLS` (BTC, ETH, SOL, BNB, XRP, ADA, DOT, MATIC, AVAX, LINK, UNI, DOGE, SHIB, LTC, TRX, TON, SUI, APT, ARB, OP) — an unrecognized ticker with no contract backing it is treated as too noisy to record and dropped.

If a call is accepted but has no symbol at all, one is synthesized from the first 6 characters of the contract address (uppercased) as a placeholder.

This cascade design means **link-based calls are trusted over bare address mentions** — a message containing both a Dexscreener link and a stray base58 string in casual conversation will always resolve to the linked token, not the coincidental string.

## 6. Idempotent writes (`upsertToken`, `insertCall`)

**`upsertToken()`** — a three-tier lookup-then-insert, not a database-level upsert:
1. If a contract address was parsed, look up `tokens` by `(chain, contract_address_normalized)`. If found, opportunistically backfill a missing `logo_url` on the existing row (cheap, and means the token doesn't have to wait for `workers/price-update.js` to notice it — which the code comments note only revisits tokens with an *open* call).
2. Else, look up by `(chain, symbol_normalized)`. Same opportunistic logo backfill if found.
3. Else, insert a brand-new token row with a synthesized unique slug (`${symbol}-${chain}-${Date.now()}`), `status: "active"`.

This mirrors the DB's own unique constraints (database doc §4.3) but resolves conflicts in application code first, rather than relying on `ON CONFLICT`, presumably because the lookup needs to also decide whether to backfill a logo — a pure DB upsert wouldn't let it conditionally patch just one column on an existing row.

**`insertCall()`**:
- Truncates `message_text` to 4000 characters before insert.
- Sets a **fixed `confidence_score: 0.75`** for every scraper-originated call (there's no dynamic confidence scoring in this version — every parsed call gets the same score regardless of which cascade tier matched).
- On a Postgres unique-violation (`error.code === "23505"`, matching the DB's `calls_channel_message_token_key` constraint), returns `false` silently — this is the expected outcome for a duplicate event (e.g. GramJS redelivering an event, or the same message being caught by both the live handler and a backfill), not an error worth logging.
- **Always creates a matching `call_metrics` row immediately** (upserted on `call_id`, defaulted to entry-price-equals-current-price, `current_multiple`/`peak_multiple` = 1, `simulated_investment_usd` = $10, everything else zeroed). The code comment is explicit about why: without this row, `workers/price-update.js` has nothing to update later, and `refresh_channel_stats()`'s `LEFT JOIN` on `call_metrics` would otherwise leave that channel's ROI/PnL stuck at 0 until the next worker cycle happened to backfill it.

## 7. Tracking-request queue (`processTrackingQueue`) — auto-onboarding new channels

Consumes rows from `tracking_requests` with `status = 'queued'`, oldest-first, up to 5 per run. For each request:

1. Mark it `processing` immediately (so a slow run doesn't get double-picked-up by an overlapping timer).
2. `client.getEntity(handle)` — resolve the handle against live Telegram. On failure, mark `failed` with `rejection_reason: "telegram_resolve_failed"` and move on (no retry logic here — a failed resolution needs a human to look at it).
3. Extract `username`, `title`, `peerId`, build `telegramUrl`, and pull a `description` from the entity's `about` field if present.
4. Check if a `channels` row already exists for this handle (`ilike` match) — if so, reuse it; if not, insert a new one with `status: "tracked"` and a slugified username.
   - On a slug collision (`23505`), retries once with a `${slug}-${Date.now()}` suffix.
5. Once a `channelId` exists either way, immediately `backfillChannel(client, channelRow, 100)` — a deeper backfill (100 messages) than the general startup backfill (50), since this is the channel's very first ingestion.
6. Marks the request `done` with the resulting `channel_id`, or `failed` with a specific `rejection_reason` at any failure point (`db_insert_failed`, `no_channel_id`, or a caught `unexpected_error` from the outer try/catch).

**Schema note worth flagging**: this code path reads/writes `tracking_requests` columns (`telegram_title`, `member_count`, `status` values of `queued`/`processing`/`done`/`failed`, `rejection_reason`) that don't exactly match the `tracking_requests` table as defined in migration `004_admin_system_fixes.sql` (which defines `channel_name`, `requested_by`, `priority`, `metadata jsonb`, and a `status` defaulting to `'pending'` with no enum constraint shown). Since Postgres `text` status columns aren't constrained by an enum here, this likely just reflects the table having evolved past what's captured in the migration file set available — not a bug per se, but a sign the `tracking_requests` schema has drifted from its original migration and should be re-checked against the live DB schema if debugging this flow.

## 8. External enrichment (`fetchDexScreenerData`)

Single call to `https://api.dexscreener.com/latest/dex/tokens/{contractAddress}`, 8-second timeout via `AbortSignal.timeout(8000)`, wrapped in a bare try/catch that returns `null` on **any** failure (network error, timeout, bad JSON) — never throws, so a Dexscreener outage degrades gracefully to a call with no entry price/logo rather than blocking ingestion. Takes only `data.pairs[0]` (the first/primary pair Dexscreener returns) and guards for `pair.info` being entirely absent, which the code notes happens for thin-liquidity or brand-new pairs.

## 9. Logging

Structured JSON logs to stdout via a small `log(level, message, meta)` helper — every line is `{ ts, level, message, ...meta }`, no external logging library (this is distinct from the `pino` dependency listed in `package.json`, which appears to be used elsewhere, not in the scraper). Four levels: `INFO`, `WARN`, `ERROR`, `DEBUG` (parse-miss messages log at `DEBUG`, keeping normal operation quiet while still being inspectable).

## 10. How this connects to the rest of the system

- **Feeds Flow 1** (data-flow doc §2) directly — every successful `insertCall()` is the trigger that eventually shows up in `channel_stats`/`trending_tokens` once the analytics workers next run.
- **Reads and writes `channels`** in two directions: reads `active`/`paused` rows to know what to watch, and *writes* new rows itself when the tracking queue onboards a channel — making the scraper one of only two channel-creation paths, the other being direct admin creation in `/kx-admin`.
- **Never writes `call_metrics` after the initial insert** — all ROI/PnL/milestone updates on existing calls are `workers/price-update.js`'s job, not the scraper's; the scraper only ever creates the metrics row's starting state.
- **Does not touch `intent_scores`, `intent_history`, or any KeluScore table** — it's purely a source-layer/intelligence-layer writer (database doc §4.2–4.3), several layers upstream of the KeluScore pipeline.