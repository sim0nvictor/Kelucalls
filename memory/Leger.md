# Kelucalls Engineering Change Ledger

> Chronological record of meaningful engineering changes, discoveries, fixes, decisions, incidents, and lessons learned in Kelucalls.

---

# Purpose

The ledger is the chronological memory of Kelucalls.

It answers:

- What changed?
- When did it change?
- Why did it change?
- What problem were we solving?
- What did we learn?
- Which memory documents contain the deeper information?

The ledger is intentionally concise.

Detailed information belongs in the appropriate memory category:

```text
architecture/
features/
fixes/
decisions/
constraints/
integrations/
incidents/
```

---

# 2026-08-28

## FEATURE-007 - Daily Research Generator

**Type:** Feature

**What changed:**
Added a JSON-first Daily Research Generator covering the twelve requested analytical sections, Sources, and a fixed financial disclaimer. The LLM receives only the normalized research snapshot and deterministic signal results.

**Why:**
Research prose must remain traceable to collected evidence and must not invent market facts, events, opinions, sources, or investment recommendations.

**Impact:**
`src/lib/research/generator.ts`, `workers/daily-research.ts`, the `generated_report` snapshot column, and the research worker scripts.

**Result:**
Malformed model JSON, missing or extra sections, and references to unsupplied evidence are rejected. Sources and the disclaimer are assembled in code, and generated reports are persisted as internal JSONB.

**Related:**

- `memory/features/daily-research.md`
- `memory/architecture/data-flow.md`
- `memory/architecture/backend.md`

## FEATURE-008 - Daily Research Reports Enter Existing Insights as Drafts

**Type:** Feature

**What changed:**
Connected validated Daily Research output to the existing `articles` table using the `research-reports` category, generated title/slug/summary/content/SEO fields, and provenance metadata.

**Why:**
Daily reports should use the established Insights editor, renderer, SEO metadata, slug rules, and publishing workflow rather than creating a parallel article system.

**Result:**
The worker creates only `draft` articles. Existing admin review and publishing remain authoritative, and retries are idempotent for a generator plus snapshot date.

**Related:**

- `src/lib/research/article.ts`
- `src/app/kx-admin/actions.ts`
- `src/app/kx-admin/(protected)/insights/page.tsx`
- `memory/features/daily-research.md`

## FIX-003 - Research Report Publication Validator

**Type:** Fix

**What changed:**
Added an evidence-based validator that checks report numbers, dates, URLs, quoted text, source metadata, and evidence paths against the exact research snapshot.

**Result:**
Validation returns `valid`, `errors`, `warnings`, and `verified_claims`. Invalid reports are rejected before persistence and are never silently corrected.

**Related:**

- `src/lib/research/validator.ts`
- `memory/features/daily-research.md`

## FEATURE-009 - Daily Research Pipeline Automation

**Type:** Architecture

**What changed:**
Added a one-shot pipeline worker with durable `research_run` states, daily idempotency, provider retries, partial-result preservation, report validation, draft creation, admin inbox notification, duration/provider metrics, and structured failure logging.

**Result:**
The worker is ready for an external Railway Cron Job or separate worker service, but scheduling remains disabled until migration `015_research_run.sql` is applied and one manual run completes successfully. The attempted manual run was blocked by Supabase error `PGRST205` because `public.research_run` is not yet in the schema cache.

**Related:**

- `supabase/migrations/015_research_run.sql`
- `src/lib/research/run-store.ts`
- `workers/daily-research.ts`
- `workers/README.md`

---

The ledger provides the timeline connecting those memories.

---

# Ledger Rules

## 1. Chronological

Entries are ordered newest first.

New entries are added at the top.

---

## 2. Meaningful Changes Only

Do not record every commit.

Record changes that affect project knowledge.

Examples:

- New features.
- Important bug fixes.
- Production crashes.
- Architectural changes.
- Database changes.
- New APIs/integrations.
- Important technical decisions.
- Security discoveries.
- Performance discoveries.
- Deployment problems.
- Failed approaches.
- Important constraints.

---

## 3. Keep Entries Concise

The ledger should summarize the event.

Do not copy entire fix or architecture documents into the ledger.

Use memory IDs to point to the detailed record.

---

## 4. Never Rewrite History

If a previous decision becomes obsolete, do not erase the historical entry.

Record the new decision and reference the previous one.

Example:

```text
DEC-004 was superseded by DEC-011.
```

This allows future agents to understand how the architecture evolved.

---

# Entry Format

Use this structure:

```markdown
## YYYY-MM-DD

### [TYPE-ID] Title

**Type:** Feature | Fix | Decision | Architecture | Constraint | Integration | Incident

**What changed:**  
Short description.

**Why:**  
Reason for the change.

**Impact:**  
What part of Kelucalls was affected.

**Result:**  
What was achieved or learned.

**Related:**

- MEMORY-ID
- MEMORY-ID
```

Not every field is mandatory.

Use only what is useful.

---

# 2026-08-26

## MEMORY-001 — Engineering Memory System Established

**Type:** Architecture

**What changed:**
Established the initial `.kelucalls/memory/` system for persistent engineering knowledge.

**Why:**
Kelucalls is continuously evolving and may be modified by multiple developers and AI agents. Previous fixes, decisions, architecture knowledge, and failures need to survive across sessions and agents.

**Impact:**
Introduces a persistent knowledge layer for the repository.

**Result:**
Future agents can search historical project knowledge before implementing changes.

**Related:**

- `memory/README.md`
- `memory/INDEX.md`
- `AGENTS.md`

---

## ARCH-001 — Documentation Architecture Established

**Type:** Architecture

**What changed:**
Separated project documentation into distinct layers:

```text
README.md
    ↓
Product and repository overview

AGENTS.md
    ↓
AI agent operating instructions

.kelucalls/memory/
    ↓
Persistent engineering knowledge
```

**Why:**
Prevents the root README from becoming a mixture of product documentation, agent instructions, and historical engineering knowledge.

**Impact:**
Documentation is now organized according to its purpose.

**Result:**
Humans, developers, and AI agents have separate entry points.

**Related:**

- `AGENTS.md`
- `memory/README.md`
- `memory/INDEX.md`

---

## ARCH-002 — Memory Categories Established

**Type:** Architecture

**What changed:**
Established the initial memory categories:

```text
architecture/
features/
fixes/
decisions/
constraints/
integrations/
incidents/
```

**Why:**
Different types of project knowledge require different documentation structures.

**Impact:**
Creates a predictable place for future knowledge.

**Result:**
Agents can search targeted memory instead of scanning the entire repository.

**Related:**

- `memory/README.md`
- `memory/INDEX.md`

---

# 2026-08-25

## FIX-001 — Dashboard Calls RLS Access Issue

**Type:** Fix

**What changed:**
The dashboard calls query was restricted to publicly valid call statuses.

**Why:**
Anonymous/public dashboard access required the query to align with the database's public data access rules.

**Impact:**
Dashboard live-call data retrieval.

**Result:**
The query explicitly filters calls to:

```text
open
closed
```

**Related:**

- `fixes/FIX-001.md`
- `architecture/dashboard.md`
- `constraints/CON-001.md`

---

## DEC-001 — Centralized Supabase Server Access

**Type:** Decision

**What changed:**
Kelucalls uses the existing centralized Supabase server-access abstraction rather than creating independent database clients throughout the application.

**Why:**
Centralization provides consistent configuration handling, fallback behavior, and error logging.

**Impact:**
Server-side database access.

**Result:**
New server-side data access should follow the established project pattern unless there is a documented reason to change it.

**Related:**

- `decisions/DEC-001.md`
- `integrations/supabase.md`
- `constraints/CON-001.md`

---

# 2026-08-24

_No significant engineering events recorded yet._

---

# 2026-08-27

## HIST-001 - Git History Reconstructed

**Type:** Architecture

**What changed:**
Reviewed every commit reachable from `main` from 2026-05-07 through 2026-08-27 and recorded the verified product, infrastructure, bug-fix, and memory-system milestones below. Generic commit messages were classified from their changed files; no behavior was inferred where the diff only showed setup or generated-file changes.

**Why:**
The ledger previously described only the memory system and a dashboard RLS fix, leaving the implemented product history difficult to discover.

**Impact:**
Future work can trace the current architecture back to the commits that introduced ingestion, analytics, authentication, market data, KeluScore, alerts, deployment, and documentation.

**Result:**
The historical record now covers all commits in the repository, with detailed subsystem knowledge remaining in the architecture and feature documents.

**Related:**

- `memory/INDEX.md`
- `memory/architecture/overview.md`
- `memory/architecture/data-flow.md`

---

# 2026-08-10

## FEATURE-006 - KeluScore Alert Delivery Completed

**Type:** Feature

**What changed:**
Added the final in-app notification surface: notification inbox, unread-count API, navbar bell, account navigation, and mark-all-read action. The preceding alert work added token price-move rules, rolling trending state, alert creation, per-caller mute, notification controls, the trending dispatcher, and master-switch enforcement.

**Why:**
Users needed a complete path from alert rule to visible, manageable notification.

**Impact:**
`/account/alerts`, `/account/notifications`, navbar notification state, `workers/intent-alerts.js`, and `workers/trending-alerts.js`.

**Result:**
Alert generation and notification management are connected end to end, with at-least-once dispatch preserved.

**Related:**

- `memory/features/notifications.md`
- `memory/features/Telegram-bot.md`
- `memory/architecture/backend.md`

---

# 2026-08-08

## FEATURE-005 - KeluScore Pipeline Expanded

**Type:** Feature

**What changed:**
Implemented KeluScore Phase 3 with score history, movement alerts, and cached LLM summaries, then removed the unused mock-data token chart. Earlier phases introduced the pure scoring model, external Dexscreener signals, intent persistence, the Opportunities page, intent APIs, and token-page score panels.

**Why:**
KeluScore needed historical context, user-facing explanations, and actionable movement signals while keeping scoring independent from request-time rendering.

**Impact:**
`workers/intent-*`, migrations `006`-`008`, `/opportunities`, token pages, account alerts, and intent components.

**Result:**
Scoring, history, summaries, and alerts are separate worker concerns; missing external data remains unknown rather than being treated as zero.

**Related:**

- `memory/features/opportunities.md`
- `memory/features/AI-summaries.md`
- `memory/features/notifications.md`
- `memory/architecture/data-flow.md`

---

# 2026-08-07

## FEATURE-004 - Real User Accounts Added

**Type:** Feature

**What changed:**
Added signup, login, password reset, account pages, profile settings, and Supabase Auth session handling. A follow-up moved `IDLE_PROFILE_STATE` out of a `use server` module so the account profile form could use it safely.

**Why:**
User-specific watchlists, alert rules, and preferences require authenticated end-user identity separate from admin authentication.

**Impact:**
Auth routes, middleware, account actions and pages, profile state, and Supabase Auth integration.

**Result:**
End-user auth uses cookie-aware `@supabase/ssr` clients and server-side `getUser()` validation; admin auth remains a separate custom session system.

**Related:**

- `memory/features/account.md`
- `memory/architecture/backend.md`
- `docs/user-accounts.md`

---

## FIX-002 - Admin Session Reliability Improved

**Type:** Fix

**What changed:**
Centralized admin session-cookie construction, added edge-safe session refresh, preserved sessions across requests, added rate limiting, and surfaced typed sign-in errors instead of collapsing all failures into invalid credentials.

**Why:**
Expired sessions and configuration failures were difficult to diagnose, and separate cookie-writing paths could drift in their attributes.

**Impact:**
Admin sign-in, middleware refresh, admin session modules, and server environment validation.

**Result:**
Admin sessions refresh consistently and misconfiguration is distinguishable from bad credentials.

**Related:**

- `memory/features/adminkx.md`
- `memory/architecture/backend.md`

---

# 2026-08-05

## FEATURE-003 - Live Market Data and Token Experience Added

**Type:** Feature

**What changed:**
Added a live token-market API with prices, market caps, 24-hour gainers and losers, live market cells, chain logos, functional trending/live filters, token detail market data, and DexScreener charts. The CSP was updated to permit the chart iframe.

**Why:**
Token and feed pages needed real market state instead of static or mock values.

**Impact:**
`/tokens`, `/trending`, `/live`, token pages, the live token API, market-data helpers, and middleware CSP.

**Result:**
Market surfaces consume live provider data, with chart embedding explicitly allowed by the security policy.

**Related:**

- `memory/features/tokens.md`
- `memory/features/live-feed.md`
- `memory/features/trending-tokens.md`
- `memory/integrations/market-data.md`

---

## FEATURE-002 - Insights CMS and Sharing Added

**Type:** Feature

**What changed:**
Added article banner image links with preview/alt text, working social share actions, article listing/detail/category/tag pages, admin article editing support, and banner upload handling.

**Why:**
Editorial content needed usable media, sharing, and administrative workflows.

**Impact:**
`/insights`, admin insights, article components, SEO metadata, and article analytics.

**Result:**
Published editorial content can be managed, displayed with linked imagery, and shared without affecting market ranking data.

**Related:**

- `memory/features/insight.md`

---

## ARCH-003 - SEO Foundations Added

**Type:** Architecture

**What changed:**
Added real channel pages, honest sitemap generation, JSON-LD structured data, `/about`, `/submit`, site metadata, and public policy pages.

**Why:**
Public discovery and search indexing needed to represent actual platform content without inventing routes or data.

**Impact:**
Channel routing, sitemap and robots behavior, schema helpers, layout metadata, and public informational pages.

**Result:**
The public web surface has canonical channel content and structured metadata backed by the application data layer.

**Related:**

- `memory/features/channel.md`
- `memory/features/channel-submission.md`
- `memory/architecture/frontend.md`

---

# 2026-05-07 to 2026-08-04

## ARCH-004 - Runtime and Deployment Foundation Established

**Type:** Architecture

**What changed:**
Established the Next.js web application, Telegram scraper, Telegraf bot workspace, Railway/Render deployment configuration, environment examples, package and lockfile setup, legal/informational routes, shared footer, site configuration, and build-artifact ignore rules. Stale Render configuration was removed and Railway was pinned to npm 11 where required.

**Why:**
Kelucalls needed separately deployable web, scraper, bot, and worker processes with reproducible builds and explicit runtime configuration.

**Impact:**
Repository structure, deployment files, `apps/bot`, scraper setup, package management, and public shell pages.

**Result:**
The current four-process architecture and Railway deployment model have a documented foundation.

**Related:**

- `memory/architecture/overview.md`
- `memory/architecture/backend.md`
- `memory/architecture/scraper.md`
- `memory/architecture/workers.md`

---

## HIST-002 - Complete Commit Inventory

**Type:** Architecture

**What changed:**
The following 45 commits were reviewed and accounted for. Entries marked `setup` are repository, dependency, deployment, or generated-file changes; they are retained here for completeness but do not imply additional product behavior.

| Date       | Commit    | Classification                                                   |
| ---------- | --------- | ---------------------------------------------------------------- |
| 2026-05-07 | `a6ce478` | initial repository baseline                                      |
| 2026-05-07 | `753e059` | setup: ignore Next build output                                  |
| 2026-07-11 | `6652d2c` | setup: Render/Railway deployment and bot scaffold                |
| 2026-07-17 | `b9a8e1a` | feature: insights/admin foundations                              |
| 2026-07-24 | `b284eae` | feature/fix: admin insights, ads, tracking and deployment config |
| 2026-07-24 | `163ce31` | feature: public policy and help pages                            |
| 2026-07-25 | `b25504e` | setup: package metadata, footer, TypeScript config               |
| 2026-07-27 | `b6dc37f` | setup: bot deployment metadata                                   |
| 2026-07-27 | `097c619` | setup: bot package metadata                                      |
| 2026-07-29 | `4b6e5a3` | setup: robots, sitemap, site config                              |
| 2026-07-31 | `0e24b20` | setup: regenerate lockfile and pin npm 11                        |
| 2026-08-01 | `5acf7d1` | setup: remove stale Render config                                |
| 2026-08-01 | `0db0287` | setup: bot deployment metadata                                   |
| 2026-08-01 | `3d99797` | setup: stop tracking tsbuildinfo                                 |
| 2026-08-01 | `74b3f2c` | setup: ignore/deployment metadata                                |
| 2026-08-03 | `9352f20` | setup: package metadata                                          |
| 2026-08-03 | `65a2d5a` | setup: package metadata                                          |
| 2026-08-03 | `5f29e77` | setup: robots metadata                                           |
| 2026-08-04 | `4bd5a5f` | setup: public logo, OG image, site config                        |
| 2026-08-04 | `dbc7bac` | feature: SEO foundations                                         |
| 2026-08-05 | `31ab03b` | feature: insights media and sharing                              |
| 2026-08-05 | `fd545a0` | feature: live token prices and movers                            |
| 2026-08-05 | `c19ca9c` | feature: chain logos, live prices, filters and charts            |
| 2026-08-05 | `047f45f` | fix: allow DexScreener iframe in CSP                             |
| 2026-08-07 | `19c2806` | setup: lock `@supabase/ssr`                                      |
| 2026-08-07 | `4b3afb4` | feature: Supabase user accounts                                  |
| 2026-08-07 | `51738db` | fix: move client state out of server action module               |
| 2026-08-07 | `ca67976` | feature: KeluScore Phase 1                                       |
| 2026-08-07 | `2a102d2` | feature: KeluScore/submit supporting assets                      |
| 2026-08-07 | `e847ffa` | feature: KeluScore Phase 2 and Opportunities                     |
| 2026-08-07 | `98d3429` | fix: admin sessions and sign-in errors                           |
| 2026-08-08 | `5c9cf73` | feature: KeluScore Phase 3                                       |
| 2026-08-08 | `606f074` | fix: remove mock token chart                                     |
| 2026-08-08 | `afa74ee` | feature: token-move alerts and trending state                    |
| 2026-08-10 | `f122aeb` | feature: alert UI and notification controls                      |
| 2026-08-10 | `8658759` | feature: trending dispatcher and master switch                   |
| 2026-08-10 | `7bc4e09` | feature: notification inbox and unread state                     |
| 2026-08-22 | `615c1c1` | setup/content: intent asset and home-page adjustment             |
| 2026-08-24 | `18928a2` | feature: dashboard, feed, trending loading states and data table |
| 2026-08-25 | `341835c` | setup: initial memory structure and scraper environment fixes    |
| 2026-08-25 | `05c5c4a` | docs: memory operating instructions and README expansion         |
| 2026-08-25 | `1a0346b` | fix/feature: live-page adjustment and metrics helper             |
| 2026-08-27 | `66f01bb` | docs: architecture memory expanded                               |
| 2026-08-27 | `77bea00` | docs: feature memory expanded                                    |
| 2026-08-27 | `a36ec82` | docs: memory cleanup, backlog, and sample fix                    |

**Result:**
No committed change reachable from `main` was omitted from the reconstruction. The three most recent memory commits are documented as documentation changes, not product features.

---

# 2026-08-26

## MEMORY-001 - Engineering Memory System Established

**Type:** Architecture

**What changed:**
Established the initial `memory/` system for persistent engineering knowledge.

**Why:**
Kelucalls is continuously evolving and may be modified by multiple developers and AI agents. Previous fixes, decisions, architecture knowledge, and failures need to survive across sessions and agents.

**Impact:**
Introduces a persistent knowledge layer for the repository.

**Result:**
Future agents can search historical project knowledge before implementing changes.

**Related:**

- `memory/README.md`
- `memory/INDEX.md`
- `memory/AGENTS.md`

# Future Entries

New entries should be added **above this section**.

Example:

```markdown
# 2026-08-27

## FIX-XXX — Token Price API Failure

**Type:** Fix

**What changed:**  
Added fallback handling for the market-data provider.

**Why:**  
The primary provider occasionally returned rate-limit responses.

**Impact:**  
Live token price display.

**Result:**  
The application now handles provider failure without breaking the dashboard.

**Related:**

- `fixes/FIX-XXX.md`
- `integrations/market-data.md`
```

---

# Memory ID Conventions

Use the following prefixes:

| Prefix     | Meaning             |
| ---------- | ------------------- |
| `ARCH-`    | Architecture        |
| `FEATURE-` | Feature             |
| `FIX-`     | Bug or crash fix    |
| `DEC-`     | Technical decision  |
| `CON-`     | Constraint          |
| `INT-`     | Integration         |
| `INC-`     | Production incident |
| `MEM-`     | Memory-system event |

Example:

```text
ARCH-014
FEATURE-027
FIX-042
DEC-018
CON-011
INT-009
INC-006
MEM-003
```

IDs must never be reused.

---

# Incident Entries

Production incidents should contain additional information:

```markdown
## INC-XXX — Short Description

**Date:** YYYY-MM-DD

**Severity:** Low | Medium | High | Critical

**Affected systems:**

- System
- System

**Symptoms:**
What users or operators observed.

**Root cause:**
What actually caused the incident.

**Resolution:**
What was done to restore the system.

**Prevention:**
What changed to reduce the probability of recurrence.

**Related:**

- FIX-XXX
- ARCH-XXX
- CON-XXX
```

---

# Decision Entries

When a technical decision is recorded, the ledger should summarize the decision rather than only saying that a decision was made.

Example:

```markdown
## DEC-XXX — Use Provider X for Market Data

**Type:** Decision

**Decision:**
Use Provider X as the initial market-data source.

**Why:**

- Free/low cost
- Required market coverage
- Acceptable rate limits
- Simple integration

**Tradeoff:**
Provider X has limited historical depth.

**Related:**

- INT-XXX
- CON-XXX
```

---

# Failed Approaches

Important failed approaches should be recorded when they contain reusable knowledge.

Example:

```markdown
## FIX-XXX — Rejected Frontend Calculation Approach

**Type:** Fix / Discovery

**Attempt:**
Calculate ranking metrics directly in the frontend.

**Result:**
Rejected.

**Why:**
Created duplicated calculation logic and inconsistent results.

**Current approach:**
Use the centralized metrics/data layer.

**Related:**

- DEC-XXX
- ARCH-XXX
```

---

# Ledger Maintenance

When adding a meaningful memory entry:

1. Create or update the detailed memory document.
2. Add the memory to `INDEX.md`.
3. Add a concise entry here.
4. Link related memories.
5. Verify the date.
6. Do not expose secrets or private information.

---

# Two-Day Engineering Reports

The ledger is also the source for periodic engineering reports.

Every two days, summarize the relevant ledger entries into:

```text
Kelucalls Engineering Report

Period:
YYYY-MM-DD → YYYY-MM-DD

Features:
...

Fixes:
...

Architecture:
...

Decisions:
...

Incidents:
...

Important discoveries:
...

Problems solved:
...

What changed:
...

Why it matters:
...

Recommended next steps:
...
```

The report should summarize what actually happened during the period.

Do not invent activity that is not present in the ledger.

---

# Golden Rule

> **The ledger records the journey. Memory documents the knowledge gained from the journey.**
