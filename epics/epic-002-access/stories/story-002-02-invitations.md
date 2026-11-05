---
id: STORY-002-02
epic: EPIC-002
title: Invite a collaborator
status: backlog
blocked: false
priority: must
milestone: M1
---
# STORY-002-02: Invite a collaborator

As a admin, I want to issue and revoke invitations, so that onboarding does not share passwords.

## Acceptance
- Given a single-use expiring invitation, when it is accepted or revoked, then replay and expired acceptance fail.
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
