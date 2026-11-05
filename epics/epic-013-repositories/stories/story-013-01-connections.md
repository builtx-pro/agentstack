---
id: STORY-013-01
epic: EPIC-013
title: Connections and provider reads
status: review
blocked: false
priority: must
milestone: M5
---
# STORY-013-01: Connections and provider reads

Connect a public or private GitHub/GitLab repository; store credentials without exposing them; fetch only approved API hosts with bounded data and time.

## Acceptance and verification
Permission isolation, credential round trip/tamper failure, provider redirects/errors/limits and pipeline provenance.

## Tasks
- [x] Agree scope and API contract.
- [x] Implement behavior and failure paths.
- [x] Run meaningful tests and applicable browser checks.
- [x] Update operator/agent documentation and verify deployed behavior.

[Specification](../../../docs/product/repository-integration.md)

[Verified release checks](../../../docs/releases/0.2.0-verification.md). Status remains review pending human acceptance.
