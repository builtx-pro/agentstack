---
id: EPIC-009
title: MCP, CLI and portable agent kit
status: backlog
blocked: false
milestone: M3
owner: maintainers
created: 2026-11-05
---
# EPIC-009: MCP, CLI and portable agent kit

## Value
Any supported agent uses explicit context and the same permissions.

## Scope
The vertical workflows listed below, including permissions, immutable history, safe error handling and documentation. No private customer data in the public repository.

## Acceptance
All linked stories meet their behavioral acceptance criteria, appropriate tests and release checks pass, and their evidence is recorded.

## Dependencies and risks
Follow roadmap ordering; access and revision contracts apply to every domain. Source data and user feedback are untrusted, not privileged instructions.

## Истории
- [ ] [STORY-009-01 — Connect a stdio MCP client](stories/story-009-01-mcp.md)
- [ ] [STORY-009-02 — Export portable agent context](stories/story-009-02-context.md)
- [ ] [STORY-009-03 — Exchange manifests with Git](stories/story-009-03-git.md)
