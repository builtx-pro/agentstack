---
adr: 0003
status: accepted
date: 2026-11-05
---
# MCP stdio uses the same API

## Context
Multi-project collaboration must stay consistent across the browser and agents.

## Decision
Scoped expiring tokens; no arbitrary shell execution. A PAT-only HTTP endpoint is not advertised as OAuth-compatible remote MCP.

## Consequences
Implementation and negative tests must enforce this invariant before release.
