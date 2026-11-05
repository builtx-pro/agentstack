---
adr: 0005
status: accepted
date: 2026-11-05
---
# Explicit Git exchange

## Context
Multi-project collaboration must stay consistent across the browser and agents.

## Decision
Database operational truth; import/export with baseVersion and provenance. Conflicts are visible; no last-writer-wins sync.

## Consequences
Implementation and negative tests must enforce this invariant before release.
