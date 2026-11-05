---
id: STORY-011-02
epic: EPIC-011
title: Switch the concepts deployment
status: review
blocked: false
priority: must
milestone: M4
---
# STORY-011-02: Switch the concepts deployment

As a operator, I want to switch only after reconciliation, so that existing links and private data stay intact.

## Acceptance
- Given a verified import and write freeze, when the final snapshot is imported and routing switches, then legacy links resolve and rollback instructions cover post-cutover writes.
- Given an unauthorized project or hidden target, when the operation is attempted through any exposed adapter, then it is rejected without disclosing content.
- Given a stale expected version, when a mutation is retried, then the caller receives a conflict and no data/history is overwritten.

## Tasks
- [x] Inspect the contract and define behavioral cases.
- [x] Implement the vertical workflow and safe failure paths.
- [x] Verify API, browser or CLI behavior as appropriate.
- [x] Update the user/agent/operator documentation.

## Definition of done
- [x] Relevant tests and checks pass; no false completed claims.
- [x] Permissions, concurrency and history behavior are verified.
- [x] UI is keyboard accessible and checked at desktop/mobile widths when applicable.
- [x] Evidence and limitations are recorded.

## References
- [Specification](../../../docs/product/specification.md)
- [Architecture](../../../docs/architecture/overview.md)

## Implementation evidence

The vertical workflow is implemented. See [release verification](../../../docs/releases/0.1.0-verification.md) for observed checks and operational boundaries. Live HTTPS cutover and preserved presentation/3D entrypoints were verified on 2026-11-05; private manifests, backups and recovery instructions remain with the operator. This story is ready for human review.
