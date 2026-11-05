---
adr: 0004
status: accepted
date: 2026-11-05
---
# Immutable revisions and reversible archives

## Context
Multi-project collaboration must stay consistent across the browser and agents.

## Decision
Updates append history transactionally; restore creates a new version. Secrets and credentials are excluded. Current permissions gate historical access.

## Consequences
Implementation and negative tests must enforce this invariant before release.
