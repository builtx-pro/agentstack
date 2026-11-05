---
id: EPIC-013
title: Connect repositories and review synchronized work
status: review
blocked: false
milestone: M5
owner: maintainers
created: 2026-11-05
---
# EPIC-013: Repositories, planning synchronization and pipelines

Developers connect GitHub, GitLab or local/CI sources to avoid copying their delivery plans and documentation into two systems. A source commit produces a reviewable changeset; human application preserves comments and history. Pipeline summaries show the source of their evidence.

## Acceptance
- Web connections fetch bounded Markdown and pipeline summaries from supported providers without executing project code.
- CLI and CI stage the same changesets from committed files or trigger provider refresh.
- Human selection applies versioned changes; concurrent web edits become explicit conflicts. Missing files do not delete work.
- Credentials remain write-only and encrypted, project isolation applies to all new data, and customer pipeline visibility is explicitly shared.

## Stories
- [ ] [STORY-013-01 — Connections and provider reads](stories/story-013-01-connections.md)
- [ ] [STORY-013-02 — Reviewed synchronization](stories/story-013-02-synchronization.md)
- [ ] [STORY-013-03 — Agent and CI integration](stories/story-013-03-agent-ci.md)
- [ ] [STORY-013-04 — Repository and pipeline UI](stories/story-013-04-web.md)

[Specification](../../docs/product/repository-integration.md)
