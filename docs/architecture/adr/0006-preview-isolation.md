---
adr: 0006
status: accepted
date: 2026-11-05
---
# Isolate untrusted preview code

## Context
Multi-project collaboration must stay consistent across the browser and agents.

## Decision
Images are protected; active HTML cannot share the administration origin. Sandbox and strict messaging; no raw SVG/HTML insertion.

## Consequences
Implementation and negative tests must enforce this invariant before release.
