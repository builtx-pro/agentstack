---
id: STORY-008-03
epic: EPIC-008
title: Read honest progress
sprint: SPRINT-003
status: review
blocked: false
priority: must
milestone: M3
---
# STORY-008-03: Read honest progress

As a reviewer, I want to see project and sprint progress, so that I can distinguish completed work from claims.

## Acceptance
- Given stories linked into several groups, when a dashboard loads, then unique stories are counted once and hidden scope is excluded.
- Given an unauthorized project or hidden target, when the operation is attempted through any exposed adapter, then it is rejected without disclosing content.

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
