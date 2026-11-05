---
adr: 0002
status: accepted
date: 2026-11-05
---
# Server-enforced project membership

## Context
Multi-project collaboration must stay consistent across the browser and agents.

## Decision
Subdomains are routing convenience, never authorization. Checks apply to API, MCP, files, search, counts and history.

## Consequences
Implementation and negative tests must enforce this invariant before release.
