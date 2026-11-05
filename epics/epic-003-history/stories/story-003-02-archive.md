---
id: STORY-003-02
epic: EPIC-003
title: Archive and restore content
status: backlog
blocked: false
priority: must
milestone: M1
---
# STORY-003-02: Archive and restore content

As a developer, I want to archive and restore old content as a new version, so that history and references remain intact.

## Acceptance
- Given an object with comments and older revisions, when it is archived and restored, then all prior events remain and a new revision records restoration.
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
