---
id: STORY-010-02
epic: EPIC-010
title: Compare screen and asset versions
sprint: SPRINT-004
status: review
blocked: false
priority: must
milestone: M4
---
# STORY-010-02: Compare screen and asset versions

As a reviewer, I want to view before/after revisions, so that I can evaluate a correction.

## Acceptance
- Given two visual revisions, when comparison opens, then both versions load with their own discussion context.
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
