---
adr: 0001
status: accepted
date: 2026-11-05
---
# One PostgreSQL backend

## Context
Multi-project collaboration must stay consistent across the browser and agents.

## Decision
One schema and migration path for local and server use; avoid splitting correctness across SQLite and PostgreSQL.

## Consequences
Implementation and negative tests must enforce this invariant before release.
