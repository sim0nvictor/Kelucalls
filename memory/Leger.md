# Kelucalls Engineering Change Ledger

> Chronological record of meaningful engineering changes, discoveries, fixes, decisions, incidents, and lessons learned in Kelucalls.

---

# Purpose

The ledger is the chronological memory of Kelucalls.

It answers:

* What changed?
* When did it change?
* Why did it change?
* What problem were we solving?
* What did we learn?
* Which memory documents contain the deeper information?

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

* New features.
* Important bug fixes.
* Production crashes.
* Architectural changes.
* Database changes.
* New APIs/integrations.
* Important technical decisions.
* Security discoveries.
* Performance discoveries.
* Deployment problems.
* Failed approaches.
* Important constraints.

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

* `memory/README.md`
* `memory/INDEX.md`
* `AGENTS.md`

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

* `AGENTS.md`
* `memory/README.md`
* `memory/INDEX.md`

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

* `memory/README.md`
* `memory/INDEX.md`

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

* `fixes/FIX-001.md`
* `architecture/dashboard.md`
* `constraints/CON-001.md`

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

* `decisions/DEC-001.md`
* `integrations/supabase.md`
* `constraints/CON-001.md`

---

# 2026-08-24

*No significant engineering events recorded yet.*

---

# Earlier Project History

Historical project work should be added here as it is reconstructed and verified.

Do not fabricate historical entries.

When reconstructing history from Git commits, pull requests, existing documentation, or code, clearly distinguish verified historical information from assumptions.

---

# 2026 08 26

# kelucalls memory was implemented 

**Type:** Engineering Memory

**What changed:**  Kelucalls now have an Engineering memory to preserve knowledge that should survive across developers, AI agents, coding sessions, refactors, and feature changes. go to memory\README.md to read more.

**Why:**
The goal is to prevent repeated mistakes, duplicated work, regression of previously fixed bugs, and unnecessary recreation of existing architecture.

**Impact:** 
Kelucalls now have a memory every developers, AI agents that are contributing to the improvement of the project to have a full understanding of the project.

**Result:** 
Optimiaze Enginnering system

**Related:**




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
