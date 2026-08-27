# AGENTS.md

# Kelucalls Agent Operating Instructions

> This document defines how AI agents must operate when working on the Kelucalls codebase.

Kelucalls is an actively evolving production project.

You are not rebuilding Kelucalls from scratch.

You are contributing to an existing system whose architecture, features, data, integrations, fixes, constraints, and decisions have been built over time by humans and other agents.

Your responsibility is therefore not only to complete the assigned task.

Your responsibility is to:

1. Understand the existing system.
2. Reuse existing solutions.
3. Avoid repeating previously solved problems.
4. Avoid introducing regressions.
5. Preserve important project behavior.
6. Document meaningful discoveries and changes.
7. Leave persistent knowledge for the next developer or agent.

---

# 1. Core Principle

> **Understand before changing.**

Never begin modifying code simply because the requested change appears simple.

First determine:

- Where the relevant functionality lives.
- How data flows through the system.
- Which components depend on it.
- Whether a similar problem has already been solved.
- Whether a technical decision already exists.
- Whether there are constraints that must be preserved.
- Whether the requested change affects historical data or analytics.

---

# 2. Kelucalls Memory System

The repository contains a persistent engineering memory system.

```text
.kelucalls/
└── memory/
    ├── README.md
    ├── INDEX.md
    ├── BACKLOG.md
    ├── ledger.md
    │
    ├── architecture/
    ├── features/
    ├── fixes/
    ├── decisions/
    ├── constraints/
    ├── integrations/
    └── incidents/