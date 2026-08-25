# Kelucalls Engineering Memory

## Purpose

This directory is the long-term engineering memory of Kelucalls.

It exists to preserve knowledge that should survive across developers, AI agents, coding sessions, refactors, and feature changes.

The purpose is not to document every line of code.

The purpose is to preserve:

* Why important parts of Kelucalls work the way they do.
* What has already been built.
* What problems have already been solved.
* Why previous solutions were chosen.
* What approaches have failed.
* What constraints must be respected.
* What architectural decisions have been made.
* What future agents need to know before changing a subsystem.

**The goal is to prevent repeated mistakes, duplicated work, regression of previously fixed bugs, and unnecessary recreation of existing architecture.**

---

# 1. Core Principle

> **Before changing Kelucalls, remember what Kelucalls has already learned.**

Every agent working on Kelucalls should:

1. Read `AGENTS.md`.
2. Read this file.
3. Identify the subsystem being changed.
4. Search the relevant memory categories.
5. Inspect the current source code.
6. Compare memory with the current implementation.
7. Make the smallest safe change.
8. Test the change.
9. Record important new knowledge.

---

# 2. Source of Truth

Memory is historical and architectural context.

The current source code is the authority for **current behavior**.

Therefore:

```text
Memory
   ↓
Historical context
   ↓
Current code
   ↓
Verify
   ↓
Change
```

Never blindly implement something simply because memory says it exists.

If memory and code disagree:

1. Do not immediately overwrite the memory.
2. Investigate why they differ.
3. Determine whether the code changed intentionally.
4. Update the memory if the architecture or behavior has changed.
5. Record the decision if the change is significant.

---

# 3. Memory Categories

## Architecture

Location:

`architecture/`

Contains knowledge about how Kelucalls is structured.

Use this for:

* system architecture
* application layers
* data flow
* frontend/backend relationships
* database architecture
* workers
* scraper architecture
* major subsystem relationships

Architecture memory should answer:

> "How does this part of Kelucalls work?"

---

## Features

Location:

`features/`

Contains important features that have been intentionally added to Kelucalls.

A feature memory should explain:

* What the feature does.
* Why it exists.
* Where it lives.
* What systems it depends on.
* Important implementation details.
* Known limitations.
* Related architecture.

Feature memory should answer:

> "What did we build and why?"

---

## Fixes

Location:

`fixes/`

Contains bugs, crashes, regressions, and their solutions.

A fix should record:

* Symptom.
* Root cause.
* Solution.
* Files affected.
* Why the solution works.
* What must not be changed.
* Related memories.
* Failed approaches when relevant.

Fix memory should answer:

> "Have we already solved this problem?"

This category is especially important.

Before fixing a bug, search here first.

---

## Decisions

Location:

`decisions/`

Contains important technical or architectural decisions.

Record decisions when:

* Multiple approaches were considered.
* An existing pattern was deliberately selected.
* A technology/API was chosen.
* A significant architectural tradeoff was made.
* A feature was deliberately implemented in a particular way.

Decision memory should answer:

> "Why did we choose this approach?"

---

## Constraints

Location:

`constraints/`

Contains rules that agents must respect.

Examples:

* Security restrictions.
* Server/client boundaries.
* Database rules.
* API limitations.
* Performance constraints.
* Existing architectural conventions.
* Things that must not be changed without explicit investigation.

Constraint memory should answer:

> "What must I avoid breaking?"

---

## Integrations

Location:

`integrations/`

Contains knowledge about external systems.

Examples:

* Supabase
* Telegram
* market-data providers
* pricing APIs
* news APIs
* social data providers
* authentication providers
* hosting infrastructure

Record:

* What the integration provides.
* How Kelucalls uses it.
* Authentication requirements.
* Rate limits.
* Important API behavior.
* Failure modes.
* Fallback behavior.
* Relevant files.

Integration memory should answer:

> "How does Kelucalls communicate with this external system?"

---

## Incidents

Location:

`incidents/`

Contains significant operational problems.

Examples:

* production crashes
* scraper failures
* worker failures
* deployment failures
* database outages
* API outages
* major regressions

Incident memory should answer:

> "What happened in production and what did we learn?"

---

# 4. Memory IDs

Every permanent memory entry must have a unique ID.

Use:

```text
ARCH-001
FEATURE-001
FIX-001
DEC-001
CON-001
INT-001
INC-001
```

Never reuse an ID.

IDs allow agents and humans to reference specific knowledge.

Example:

```text
This change addresses FIX-014.

The implementation must preserve CON-006.

Architecture follows ARCH-003.
```

---

# 5. When to Create Memory

Do not create a memory entry for every tiny code change.

Create memory when the project learns something that would be useful later.

Create memory for:

* New major features.
* Important bug fixes.
* Crashes.
* Production incidents.
* Database changes.
* Architectural changes.
* New integrations.
* Security discoveries.
* Performance discoveries.
* Important API limitations.
* Failed implementation approaches.
* Important technical decisions.
* Important deployment discoveries.
* Rules future agents must respect.

Ask:

> "Would another agent benefit from knowing this six months from now?"

If yes, record it.

---

# 6. When NOT to Create Memory

Do not create permanent memory for trivial changes such as:

* Typo corrections.
* Formatting changes.
* Simple copy changes.
* Renaming an unused variable.
* Minor CSS adjustments.
* Routine dependency updates without architectural impact.

Use Git history for these.

Memory is for **knowledge**, not a replacement for Git.

---

# 7. Before Starting a Task

Before modifying code, perform a memory check.

Determine:

```text
What subsystem am I changing?

What files am I touching?

What external systems are involved?

Has this subsystem failed before?

Are there existing constraints?

Are there architectural decisions?

Has somebody already attempted this solution?
```

Then search:

```text
architecture/
features/
fixes/
decisions/
constraints/
integrations/
incidents/
```

Do not assume there is no relevant memory until you have searched.

---

# 8. Bug/Fix Workflow

When fixing a bug:

```text
1. Describe the symptom.
2. Search existing fixes.
3. Search related architecture.
4. Inspect current code.
5. Identify root cause.
6. Check whether the same root cause appeared before.
7. Implement the smallest safe fix.
8. Test.
9. Record the fix.
10. Add related memories.
11. Update ledger.md.
```

If the same bug already exists in memory, do not create a duplicate memory entry unless the new occurrence reveals something materially different.

Instead, update the existing memory or create a related incident.

---

# 9. Failed Approaches

Failed approaches are valuable knowledge.

If an implementation was tried and rejected because it caused:

* performance problems
* security problems
* architectural problems
* incorrect results
* scalability problems
* unnecessary complexity
* dependency problems

record it.

Example:

```text
## Failed Approach

Attempt:
Calculate ranking metrics directly in the frontend.

Result:
Rejected.

Reason:
Created duplicated calculation logic and inconsistent results.

Current approach:
Use the existing aggregated statistics layer.
```

The purpose is to prevent future agents from repeating the same experiment.

---

# 10. Updating Memory

When an agent completes a meaningful task, ask:

```text
What changed?

Why did it change?

What problem was solved?

What did we learn?

Is there a new constraint?

Did the architecture change?

Did an existing assumption become invalid?

Could another agent accidentally break this later?
```

If the answer to any of these is important, update memory.

---

# 11. Updating Existing Memory

Prefer updating an existing memory entry when:

* the same feature evolved
* the same bug was investigated again
* an existing decision changed
* an integration changed behavior
* an architecture document became outdated

Do not create multiple memories describing the same knowledge.

Keep memory consolidated where possible.

---

# 12. Related Memories

Memory entries should reference related knowledge whenever useful.

Example:

```text
Related:

- ARCH-003 — Dashboard architecture
- FIX-012 — Previous Supabase RLS issue
- CON-004 — Public data access rules
```

This creates connections between pieces of project knowledge.

---

# 13. Change Ledger

Every meaningful memory update should also be recorded in:

`ledger.md`

The ledger is chronological.

Example:

```text
## 2026-08-25

### FIX-017
Fixed dashboard calls RLS issue.

### DEC-009
Established centralized Supabase server access pattern.
```

The ledger provides a timeline of Kelucalls' evolution.

---

# 14. Memory Quality Rules

Good memory should be:

* Specific.
* Concise.
* Technically accurate.
* Based on actual project behavior.
* Useful to future agents.
* Clear about cause and effect.
* Clear about what should and should not be changed.

Avoid:

* vague statements
* assumptions presented as facts
* unnecessary prose
* duplicated information
* undocumented speculation

Bad:

```text
Dashboard has some Supabase stuff.
```

Good:

```text
Dashboard data access is centralized in dashboard-data.ts.
The data layer queries Supabase and maps database rows into
application types defined in kelucalls.ts.
```

---

# 15. Never Store Secrets

Never place the following in memory:

* API keys.
* Passwords.
* Tokens.
* Service-role credentials.
* Private keys.
* `.env` contents.
* Authentication secrets.
* Private user information.

Refer to the configuration variable by name if necessary.

Example:

```text
Uses SUPABASE_SERVICE_ROLE_KEY.

Do not record its value.
```

---

# 16. Memory and Git

Memory does not replace Git.

Git answers:

> "What changed?"

Memory answers:

> "Why did it change and what did we learn?"

Use both.

A useful commit can reference memory:

```text
fix: resolve dashboard RLS failure

Memory: FIX-017
```

---

# 17. Agent Safety Rule

An agent must not make a major architectural change simply because it believes another approach is better.

Before changing an established pattern:

1. Search memory.
2. Identify the existing decision.
3. Understand why it exists.
4. Determine whether the original constraint still applies.
5. Explain the proposed change.
6. Update the decision memory if the architecture changes.

Prefer incremental evolution over unnecessary rewrites.

---

# 18. Memory Maintenance

Memory should evolve with Kelucalls.

Periodically:

* Remove duplicates.
* Mark obsolete decisions.
* Update outdated architecture.
* Link related memories.
* Record superseded decisions.
* Keep the ledger chronological.
* Verify important constraints against the current code.

Never silently delete historical knowledge.

If something is no longer valid, mark it:

```text
Status: superseded
Superseded by: DEC-021
```

---

# 19. The Memory Loop

Every meaningful engineering task should follow:

```text
          ┌───────────────┐
          │  New Task     │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Search Memory │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Inspect Code  │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Make Change   │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Test Change   │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ What Learned? │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Update Memory │
          └───────┬───────┘
                  ↓
          ┌───────────────┐
          │ Update Ledger │
          └───────────────┘
                  │
                  └──────────────→ Next Agent
```

---

# 20. Future Evolution

The initial memory system should remain simple and Git-based.

Future versions may add:

* CLI search.
* Automated memory extraction.
* Semantic search.
* Embeddings.
* Vector storage.
* Memory APIs.
* MCP integration.
* Agent-specific memory retrieval.
* Automatic change summaries.
* Two-day engineering reports.
* Memory conflict detection.
* Architecture drift detection.

Do not introduce these systems until the basic memory process is reliable.

---

# Final Rule

> **Every agent should leave Kelucalls at least as understandable as it found it.**

If an agent fixes something important, the next agent should not have to rediscover the problem.

If an agent makes an architectural decision, the next agent should understand why.

If an approach failed, the next agent should know not to repeat it.

If the architecture changes, the memory should change with it.

**Kelucalls memory exists so that project knowledge survives the individual agent that created it.**
