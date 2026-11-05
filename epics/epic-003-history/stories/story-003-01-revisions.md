---
id: STORY-003-01
epic: EPIC-003
title: Compare object revisions
status: review
blocked: false
priority: must
milestone: M1
---
# STORY-003-01: Compare object revisions

As a developer, I want to see who changed content and compare versions, so that I can understand regressions.

## Acceptance
- Given two editors share an object version, when both save, then one succeeds and the other sees a recoverable conflict.
- Given an unauthorized project or hidden target, when the operation is attempted through any exposed adapter, then it is rejected without disclosing content.
- Given a stale expected version, when a mutation is retried, then the caller receives a conflict and no data/history is overwritten.

- Given two accessible revisions, when comparison opens, then both contents, author/time and a correct diff are visible.
- Given an internal historical revision and a newly customer-visible current revision, when a customer reads history, then the internal revision and its diff are omitted.
- Given an update failure, when the transaction rolls back, then neither content nor a partial audit event remains.

## Tasks
- [ ] Inspect the contract and define behavioral cases.
- [ ] Implement the vertical workflow and safe failure paths.
- [ ] Verify API, browser or CLI behavior as appropriate.
- [ ] Update the user/agent/operator documentation.

## Definition of done
- [ ] Relevant tests and checks pass; no false completed claims.
- [ ] Permissions, concurrency and history behavior are verified.
- [ ] UI is keyboard accessible and checked at desktop/mobile widths when applicable.
- [ ] Evidence and limitations are recorded.

## References
- [Specification](../../../docs/product/specification.md)
- [Architecture](../../../docs/architecture/overview.md)

## Implementation evidence

The vertical workflow is implemented. See [release verification](../../../docs/releases/0.1.0-verification.md) for observed checks and operational boundaries. Final live cutover remains tracked separately in STORY-011-02.
