---
id: STORY-009-03
epic: EPIC-009
title: Exchange manifests with Git
sprint: SPRINT-003
status: review
blocked: false
priority: must
milestone: M3
---
# STORY-009-03: Exchange manifests with Git

As a developer, I want to import/export versioned project material, so that web changes and repository work remain reconcilable.

## Acceptance
- Given a base revision and changed local file, when a conflicting import is attempted, then a report explains the conflict without overwriting either version.
- Given an unauthorized project or hidden target, when the operation is attempted through any exposed adapter, then it is rejected without disclosing content.
- Given a stale expected version, when a mutation is retried, then the caller receives a conflict and no data/history is overwritten.

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
