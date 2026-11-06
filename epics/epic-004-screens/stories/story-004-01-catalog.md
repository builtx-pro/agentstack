---
id: STORY-004-01
epic: EPIC-004
title: Import and find screens
sprint: SPRINT-002
status: review
blocked: false
priority: must
milestone: M2
---
# STORY-004-01: Import and find screens

As a developer, I want to import a manifest and search flows/tags, so that I review generated UI in one pass.

## Acceptance
- Given a valid versioned catalog, when it is imported twice, then stable identities remain and duplicate records are not created.
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

## Follow-up: ordering, tags and languages

The [catalog navigation and language contract](../../../docs/product/catalog-and-locales.md) tracks source ordering, discoverability of alternate states, clickable tags and RU/EN interface support. Implementation and verification are in progress; these follow-ups do not change existing acceptance or archive semantics.
