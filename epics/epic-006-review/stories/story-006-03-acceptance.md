---
id: STORY-006-03
epic: EPIC-006
title: Accept or reopen a result
sprint: SPRINT-002
status: review
blocked: false
priority: must
milestone: M2
---
# STORY-006-03: Accept or reopen a result

As a reviewer, I want to accept or return a change, so that I control whether it meets expectations.

## Acceptance
- Given a ready-for-review result, when a human accepts or reopens it, then history records the decision and agents cannot self-accept.
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
