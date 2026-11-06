---
id: STORY-013-03
epic: EPIC-013
title: Agent and CI integration
sprint: SPRINT-005
status: review
blocked: false
priority: must
milestone: M5
---
# STORY-013-03: Agent and CI integration

Use the SDK, CLI, MCP and ready CI templates to inspect repositories and stage committed changes without granting agents human acceptance.

## Acceptance and verification
Committed vs dirty files, symlinks and path bounds, branch/commit validation, reported provenance, safe CLI errors and MCP tool permissions.

## Tasks
- [x] Agree scope and API contract.
- [x] Implement behavior and failure paths.
- [x] Run meaningful tests and applicable browser checks.
- [x] Update operator/agent documentation and verify deployed behavior.

[Specification](../../../docs/product/repository-integration.md)

[Verified release checks](../../../docs/releases/0.2.0-verification.md). Status remains review pending human acceptance.
