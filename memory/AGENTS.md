# Kelucalls — AI Agent Instructions

## Purpose

You are working on **Kelucalls**, an existing production crypto intelligence platform.

You are **not rebuilding Kelucalls from scratch**.

Your job is to safely evolve the existing system while preserving working functionality, architectural decisions, data integrity, and previously solved problems.

Before making changes, understand what already exists.

---

# 1. Core Rule

> **Do not recreate what already exists. Do not fix what has already been fixed without first understanding why it was fixed. Do not replace an existing architecture without a documented reason.**

Kelucalls is an evolving system.

Multiple developers and AI agents may work on the project over time.

The repository's memory exists so that knowledge survives between agents.

Before implementing a task, use that memory.

---

# 2. Required Reading

Before modifying code, read:

```text
README.md
AGENTS.md
.kelucalls/memory/README.md
.kelucalls/memory/INDEX.md
```

Then identify the subsystem involved in the task and read the relevant memory.

For example:

```text
Dashboard task
    ↓
memory/architecture/
memory/features/
memory/fixes/
memory/decisions/
memory/constraints/
```

Do not blindly read the entire memory directory.

Read what is relevant to the task.

---

# 3. Memory Comes Before Modification

Before touching code, answer:

```text
What part of Kelucalls am I changing?

What files are involved?

Has this area been changed before?

Has this area broken before?

Are there known fixes?

Are there architectural decisions?

Are there constraints?

Are there failed approaches?

Are there external integrations involved?
```

Search the memory system before implementing.

Pay particular attention to:

```text
.kelucalls/memory/fixes/
.kelucalls/memory/decisions/
.kelucalls/memory/constraints/
.kelucalls/memory/architecture/
.kelucalls/memory/integrations/
```

---

# 4. Current Code vs Memory

Memory contains historical and architectural knowledge.

The current code is the authority for current behavior.

If memory and code disagree:

1. Stop and investigate.
2. Determine why they differ.
3. Do not blindly follow either one.
4. Determine whether the difference is intentional.
5. Update memory if the project has evolved.

Never silently overwrite historical knowledge because the current code looks different.

---

# 5. Understand Before Changing

Do not modify a file simply because it appears related to the task.

First understand:

```text
Who calls this code?

What does this code call?

What data does it read?

What data does it write?

What database tables are involved?

What external APIs are involved?

What assumptions does the code make?

What other features depend on it?
```

Trace the relevant data flow before changing behavior.

---

# 6. Preserve Existing Architecture

Prefer existing project patterns over introducing new patterns.

Before creating:

* a new utility
* a new API client
* a new database access pattern
* a new data-fetching mechanism
* a new state-management pattern
* a new validation mechanism
* a new error-handling mechanism

search the existing codebase first.

If an existing project abstraction already solves the problem, use it unless there is a documented reason not to.

---

# 7. Make the Smallest Safe Change

Prefer:

```text
small targeted change
```

over:

```text
large refactor
```

Do not refactor unrelated code while solving a specific task.

Do not rename or reorganize unrelated files.

Do not replace working systems merely because another implementation appears cleaner.

Every additional change increases regression risk.

---

# 8. Do Not Assume

Never assume:

* a function does not exist.
* an API is unavailable.
* a database table does not exist.
* a feature is not implemented.
* a previous fix does not exist.
* a dependency is required.
* a worker is responsible for something.
* a schema needs to change.
* a component needs to be rewritten.

Search first.

Inspect the actual repository.

---

# 9. Database and Supabase

Kelucalls uses Supabase as a major data layer.

Before changing database behavior:

1. Inspect existing queries.
2. Inspect relevant types.
3. Inspect the database schema/migrations available in the repository.
4. Check existing RLS behavior.
5. Search memory for previous database fixes.
6. Check whether the operation is server-side or client-side.

Preserve existing database access patterns unless there is a documented reason to change them.

Do not introduce duplicate database clients without understanding the existing architecture.

---

# 10. Security

Never expose secrets.

Never read, print, commit, or document secret values.

Never place secrets in:

* source code
* README files
* AGENTS.md
* memory files
* commits
* logs
* client-side code

This includes:

```text
API keys
passwords
tokens
private keys
service-role credentials
authentication secrets
.env contents
```

Reference environment variable names when necessary, but never record their values.

If an `.env` file is accidentally provided or uploaded:

**Do not inspect its contents. Tell the project owner to remove it.**

---

# 11. External APIs and Live Data

Kelucalls increasingly depends on external live data.

When working with an external API:

1. Identify the existing integration first.
2. Search memory for its limitations.
3. Check whether the project already has a client or abstraction.
4. Understand rate limits and failure behavior.
5. Implement graceful failure where appropriate.
6. Avoid introducing expensive APIs when an existing suitable low-cost/free source is available unless the task explicitly requires it.

Do not create duplicate API integrations for the same data source.

---

# 12. Workers, Scrapers, and Background Processes

Before modifying a worker or scraper:

Understand:

```text
What starts it?

What data does it consume?

What data does it produce?

How often does it run?

What happens when it fails?

What depends on its output?
```

Do not move logic between the application, scraper, and workers without understanding the existing data flow.

Background systems can affect production data even when the frontend appears unaffected.

---

# 13. Type Safety

Respect existing TypeScript types.

Before changing a type:

1. Search for all usages.
2. Understand the database shape.
3. Understand the API/data-layer shape.
4. Check frontend consumers.
5. Determine whether the type represents persisted data or transformed application data.

Do not use `any` as a shortcut for understanding an existing type mismatch.

---

# 14. Error Handling

When encountering an error:

Do not immediately patch the visible symptom.

Determine:

```text
Symptom
   ↓
Failure point
   ↓
Root cause
   ↓
Correct fix
```

If a previous fix exists for the same subsystem, read it before changing the code.

A fix that hides an error without solving the underlying problem is not considered complete.

---

# 15. Testing and Verification

After making a change:

1. Run the most relevant tests.
2. Run TypeScript/build checks where appropriate.
3. Verify affected functionality.
4. Check for regressions.
5. Review the final diff.
6. Confirm unrelated files were not modified accidentally.

If tests cannot be run, state that clearly.

Do not claim a change is verified when it has not been tested.

---

# 16. Feature Work

When implementing a new feature:

Before coding:

```text
Understand existing architecture
        ↓
Search memory
        ↓
Identify reusable components
        ↓
Identify data sources
        ↓
Identify constraints
        ↓
Plan smallest integration
```

After coding:

```text
Test
 ↓
Document
 ↓
Update memory
 ↓
Update ledger
```

A feature is not fully complete if important architectural knowledge created by that feature has not been recorded.

---

# 17. Bug Fix Workflow

When fixing a bug:

```text
1. Reproduce or understand the failure.
2. Search memory for related fixes.
3. Search Git/code history when useful.
4. Inspect the current implementation.
5. Identify root cause.
6. Determine the smallest safe fix.
7. Implement.
8. Test.
9. Check for regression.
10. Create/update a FIX memory entry.
11. Update related architecture/constraint memory if necessary.
12. Update ledger.md.
```

A bug fix should document the **root cause**, not only the code that changed.

---

# 18. Failed Approaches

If an approach was attempted and rejected, record it when the lesson is useful.

Examples:

* API that was unreliable.
* Architecture that caused scaling problems.
* Database query that caused RLS failures.
* Frontend approach that created duplicated logic.
* Worker design that caused race conditions.
* Dependency that created unnecessary complexity.

Future agents should not repeatedly rediscover known failures.

---

# 19. Memory Update Requirements

After every meaningful task, ask:

```text
Did we add a feature?

Did we fix a bug?

Did we discover a constraint?

Did architecture change?

Did an important decision change?

Did we discover an API limitation?

Did we discover a deployment/runtime issue?

Did we learn something future agents should know?
```

If yes, update the appropriate memory.

Possible categories:

```text
architecture/
features/
fixes/
decisions/
constraints/
integrations/
incidents/
```

Also update:

```text
.kelucalls/memory/INDEX.md
.kelucalls/memory/ledger.md
```

when appropriate.

---

# 20. Do Not Create Duplicate Memory

Before creating a new memory entry:

Search for existing related entries.

If the knowledge already exists:

* update the existing entry, or
* create a clearly related entry only if the new event contains materially different information.

Do not create:

```text
FIX-021
FIX-022
FIX-023
```

for the same underlying problem unless they represent genuinely different incidents or discoveries.

---

# 21. Architecture Changes Require Extra Care

If a task requires changing architecture:

Do not silently make the change.

First determine:

```text
Why is the existing architecture insufficient?

What problem does the new architecture solve?

What existing systems depend on the current design?

What migration is required?

What could break?

What is the rollback path?
```

Then record the decision in:

```text
.kelucalls/memory/decisions/
```

and update relevant architecture documentation.

---

# 22. No Unrequested Rewrites

Do not:

* rewrite entire files unnecessarily.
* migrate frameworks without instruction.
* replace working libraries without reason.
* restructure the repository for personal preference.
* rename major systems casually.
* delete apparently unused code without investigation.
* replace existing implementations simply because another pattern is preferred.

If a rewrite appears necessary, explain why before proceeding.

---

# 23. Respect Product Behavior

Do not change user-facing behavior unrelated to the assigned task.

Existing behavior may depend on:

* ranking logic
* tracking logic
* pricing calculations
* channel statistics
* Telegram data
* sponsored placement rules
* verification rules
* public/private data access
* legal/disclaimer requirements

If your change could affect one of these, investigate the dependency first.

---

# 24. Preserve Data Integrity

Kelucalls tracks historical crypto call performance.

Be especially careful when changing:

* calls
* tokens
* channels
* call metrics
* historical prices
* ROI calculations
* ranking calculations
* trending aggregation
* timestamps
* database migrations

Never casually rewrite historical data.

Understand whether a change affects:

```text
historical data
current data
aggregated data
derived metrics
```

before implementing it.

---

# 25. Git Discipline

Before finishing:

Review:

```text
git status
git diff
```

Look for:

* accidental changes
* generated files
* secrets
* unrelated modifications
* debugging code
* temporary files

Do not commit secrets or `.env` files.

Keep commits focused when possible.

Reference relevant memory IDs in commit messages when useful.

Example:

```text
fix: resolve dashboard RLS filtering

Memory: FIX-017
```

---

# 26. Final Task Report

When completing a meaningful task, report:

```text
What changed:
...

Why:
...

Files changed:
...

Root cause:
...

How it was fixed:
...

Testing:
...

Memory updated:
...

Known limitations:
...
```

Do not claim success without verification.

---

# 27. The Kelucalls Agent Loop

Every meaningful task should follow this loop:

```text
             ┌─────────────────┐
             │    RECEIVE      │
             │      TASK       │
             └────────┬────────┘
                      ↓
             ┌─────────────────┐
             │    REMEMBER     │
             │  Search Memory  │
             └────────┬────────┘
                      ↓
             ┌─────────────────┐
             │    INSPECT      │
             │  Understand Code│
             └────────┬────────┘
                      ↓
             ┌─────────────────┐
             │      PLAN       │
             │ Smallest Change │
             └────────┬────────┘
                      ↓
             ┌─────────────────┐
             │     CHANGE      │
             │ Modify Safely   │
             └────────┬────────┘
                      ↓
             ┌─────────────────┐
             │     VERIFY      │
             │ Test + Review   │
             └────────┬────────┘
                      ↓
             ┌─────────────────┐
             │      TEACH      │
             │ Update Memory   │
             └────────┬────────┘
                      ↓
             ┌─────────────────┐
             │     REPORT      │
             │ Explain Result  │
             └─────────────────┘
```

---

# 28. Final Principle

> **Leave Kelucalls more understandable than you found it.**

Every agent is temporarily responsible for the project.

The next agent should inherit:

* the working code
* the reasoning behind important decisions
* knowledge of previous failures
* known constraints
* useful architectural context
* a clear history of meaningful changes

Do not optimize only for completing the current task.

Optimize for the next engineer who will have to understand your work.
