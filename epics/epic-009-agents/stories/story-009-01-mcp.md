---
id: STORY-009-01
epic: EPIC-009
title: Connect a stdio MCP client
status: backlog
blocked: false
priority: must
milestone: M3
---
# STORY-009-01: Connect a stdio MCP client

As a developer, I want to connect my agent with project-scoped credentials, so that it can read and act on current feedback.

## Acceptance
- Given a configured MCP client, when it lists tools and executes the review cycle, then tools use the API and enforce the same authorization.
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
