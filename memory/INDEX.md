# Kelucalls Engineering Memory Index

> Central index of the persistent engineering knowledge maintained for Kelucalls.

This file is the navigation layer for `.kelucalls/memory/`.

It does not contain the full knowledge itself. It points agents and developers to the relevant memory.

---

# Memory Status

**Memory system:** Active

**Last updated:** 2026-08-28

**Primary purpose:** Preserve engineering knowledge across developers, AI agents, features, fixes, refactors, and incidents.

---

# How to Use This Index

Before modifying Kelucalls:

1. Identify the subsystem being changed.
2. Check the relevant category below.
3. Search for related memories.
4. Read relevant architecture and constraints first.
5. Check previous fixes before debugging.
6. Check decisions before replacing an existing approach.
7. Update this index when new permanent memory is created.

If you cannot find relevant memory, inspect the codebase before assuming the knowledge does not exist.

---

# Memory Categories

## Architecture

Location:

`architecture/`

Documents how Kelucalls is structured and how its major systems interact.

### Current Entries

| ID       | Document                    | Description                                    |
| -------- | --------------------------- | ---------------------------------------------- |
| ARCH-001 | `architecture/overview.md`  | High-level Kelucalls system architecture       |
| ARCH-002 | `architecture/dashboard.md` | Dashboard data and application flow            |
| ARCH-003 | `architecture/database.md`  | Database and data-layer architecture           |
| ARCH-004 | `architecture/workers.md`   | Background workers and processing architecture |
| ARCH-005 | `architecture/scraper.md`   | Telegram scraper architecture                  |
| ARCH-006 | `architecture/data-flow.md` | Major data flows through Kelucalls             |
| ARCH-007 | `architecture/overview.md`  | Verified Git history and runtime foundation    |

---

# Features

Location:

`features/`

Documents significant features and why they exist.

### Current Entries

| ID          | Document                          | Description                                 |
| ----------- | --------------------------------- | ------------------------------------------- |
| FEATURE-001 | `features/channel-leaderboard.md` | Channel ranking and performance leaderboard |
| FEATURE-002 | `features/trending-tokens.md`     | Trending token aggregation and display      |
| FEATURE-003 | `features/live-calls.md`          | Live call tracking and performance data     |
| FEATURE-004 | `features/channel-submission.md`  | Channel submission and verification flow    |
| FEATURE-005 | `features/telegram-alerts.md`     | Telegram bot and alert functionality        |
| FEATURE-006 | `features/opportunities.md`       | KeluScore intent and alert pipeline         |
| FEATURE-007 | `features/daily-research.md`      | JSON-first evidence-bound research reports  |

---

# Fixes

Location:

`fixes/`

Documents bugs, crashes, regressions, root causes, and permanent solutions.

### Current Entries

| ID      | Document           | Description                                  |
| ------- | ------------------ | -------------------------------------------- |
| FIX-001 | `fixes/FIX-001.md` | Dashboard calls query and Supabase RLS issue |
| FIX-004 | `fixes/FIX-004.md` | Daily Research worker awaited report type regression |

> **Important:** Always search this category before fixing a bug.

When adding a fix, determine whether the same root cause has already been documented.

---

# Decisions

Location:

`decisions/`

Documents important technical and architectural decisions.

### Current Entries

| ID      | Document               | Description                                |
| ------- | ---------------------- | ------------------------------------------ |
| DEC-001 | `decisions/DEC-001.md` | Centralized Supabase server access pattern |

Decisions should explain **why** an approach was selected, not merely what was implemented.

---

# Constraints

Location:

`constraints/`

Documents rules that future agents must preserve.

### Current Entries

| ID      | Document                 | Description                                         |
| ------- | ------------------------ | --------------------------------------------------- |
| CON-001 | `constraints/CON-001.md` | Server-side handling of privileged Supabase access  |
| CON-002 | `constraints/CON-002.md` | Secrets and credential handling                     |
| CON-003 | `constraints/CON-003.md` | Preserve historical call-performance data integrity |

Constraints should be checked before making changes that could affect the relevant subsystem.

---

# Integrations

Location:

`integrations/`

Documents external services and APIs used by Kelucalls.

### Current Entries

| ID      | Document                      | Description                              |
| ------- | ----------------------------- | ---------------------------------------- |
| INT-001 | `integrations/supabase.md`    | Supabase integration and access patterns |
| INT-002 | `integrations/telegram.md`    | Telegram data and bot integration        |
| INT-003 | `integrations/market-data.md` | Market and token price data providers    |
| INT-004 | `integrations/news.md`        | News and external intelligence providers |

Integration documentation should include important API behavior, limitations, rate limits, failure modes, and fallback behavior when known.

---

# Incidents

Location:

`incidents/`

Documents significant production or operational failures.

### Current Entries

_No permanent incidents documented yet._

When an incident occurs, record:

- What happened.
- When it happened.
- Impact.
- Root cause.
- Resolution.
- Preventive action.
- Related fixes or decisions.

---

# Change Ledger

Location:

`ledger.md`

The chronological history of meaningful engineering changes.

The ledger records:

- Features added.
- Bugs fixed.
- Architectural changes.
- Important decisions.
- New integrations.
- Significant incidents.
- Important discoveries.

See:

`ledger.md`

The ledger includes a verified reconstruction of all 45 commits reachable from `main` through 2026-08-27, grouped into meaningful milestones plus a complete commit inventory.

---

# Architecture Map

The current memory structure follows this model:

```text
                         Kelucalls
                             │
             ┌───────────────┼───────────────┐
             │               │               │
        Application        Data          External Systems
             │               │               │
             │            Supabase        Telegram
             │            Database        APIs
             │               │               │
             └───────────────┼───────────────┘
                             │
                      Memory Layer
                             │
        ┌────────────┬───────┼────────┬────────────┐
        ↓            ↓       ↓        ↓            ↓
   Architecture  Features  Fixes  Decisions  Constraints
        │            │       │        │            │
        └────────────┴───────┼────────┴────────────┘
                             ↓
                       Change Ledger
```

---

# Important Known Patterns

These are high-level patterns that have already appeared in the project.

## Data Layer

Dashboard data is retrieved and transformed through the application data layer rather than exposing raw database rows directly to UI consumers.

Relevant areas:

```text
dashboard-data.ts
kelucalls.ts
metrics.ts
```

See:

- `architecture/dashboard.md`
- `architecture/database.md`

---

## Supabase Access

Server-side Supabase access is centralized through the existing project abstraction.

Relevant area:

```text
supabase.ts
```

See:

- `integrations/supabase.md`
- `decisions/DEC-001.md`
- `constraints/CON-001.md`

---

## Metrics

Core performance calculations are centralized in the metrics layer.

Relevant area:

```text
metrics.ts
```

Important calculations include:

- ROI percentage
- Multiple
- Milestones
- Simulated PnL
- Ranking score
- Formatting

See:

- `architecture/data-flow.md`
- `features/channel-leaderboard.md`

---

# Known Fixes Agents Should Be Aware Of

## Dashboard / Supabase RLS

A previous dashboard issue involved the calls query being blocked for anonymous users.

The query was changed to restrict calls to publicly valid statuses:

```text id="b1q0kn"
.in("status", ["open", "closed"])
```

See:

`fixes/FIX-001.md`

**Do not remove or alter this behavior without understanding the related RLS policy.**

---

# Memory Relationships

Memory entries can reference each other.

Example:

```text id="m3j4kc"
FEATURE-001
     │
     ├── ARCH-002
     ├── DEC-001
     ├── CON-003
     └── FIX-001
```

When creating a new memory entry, add related memory IDs whenever they provide useful context.

---

# Superseded Knowledge

Historical decisions should not be silently deleted.

When a decision or architecture document becomes obsolete:

```text id="5e7v8u"
Status: superseded
Superseded by: DEC-XXX
```

Keep the historical record so future agents understand why the previous approach existed.

---

# Recently Added

This section provides a quick view of the newest important memories.

### 2026-08-26

- Memory system established.
- Agent memory workflow established.
- Initial architecture documentation structure established.

### 2026-08-27

- Complete committed-history reconstruction added to `ledger.md`.
- KeluScore, alerts, live market data, Insights, SEO, accounts, and deployment milestones recorded.
- All 45 commits reachable from `main` accounted for in the commit inventory.

### 2026-08-25

- Dashboard/Supabase RLS fix identified and documented.
- Existing Supabase access pattern identified.
- Dashboard data-layer structure documented.

---

# Memory Maintenance

When adding or removing memory:

- Add or update the entry in the appropriate category.
- Update this index.
- Add the change to `ledger.md`.
- Add relationships to relevant memories.
- Mark superseded entries rather than silently deleting them.

The index must remain a reliable map of the memory system.

---

# Quick Navigation

```text
Memory instructions
→ README.md

Architecture
→ architecture/

Features
→ features/

Bug fixes
→ fixes/

Technical decisions
→ decisions/

Rules and constraints
→ constraints/

External services
→ integrations/

Production incidents
→ incidents/

Project history
→ ledger.md
```

---

# Golden Rule

> **If a future agent could reasonably need to know it, and the knowledge is not obvious from the current code, it belongs somewhere in the memory system.**

The index tells the agent where to find it.
