---
id: STORY-008-01
epic: EPIC-008
title: Maintain delivery structure
status: backlog
blocked: false
priority: must
milestone: M3
---
# STORY-008-01: Maintain delivery structure

As a developer, I want to edit waves/epics/stories/sprints and checklists, so that work has explicit ownership and acceptance.

## Acceptance
- Given a project plan, when a relationship is edited, then cycles, foreign-project links and duplicate feature links are rejected.
- Given an unauthorized project or hidden target, when the operation is attempted through any exposed adapter, then it is rejected without disclosing content.
- Given a stale expected version, when a mutation is retried, then the caller receives a conflict and no data/history is overwritten.

- Given an editable plan, when a developer creates a wave/epic/story/sprint and changes a checklist item, then the hierarchy and checkbox persist with versions and history.
- Given an epic with active stories, when its wave is archived, then effective progress excludes these stories and restores them when unarchived.

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
