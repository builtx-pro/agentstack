---
adr: 0007
status: accepted
date: 2026-11-05
---
# Count unique completed stories

## Context
Multi-project collaboration must stay consistent across the browser and agents.

## Decision
Epics, waves, sprints and features aggregate the same story set. No duplicate counting; history-backed charts only.

## Consequences
Implementation and negative tests must enforce this invariant before release.
