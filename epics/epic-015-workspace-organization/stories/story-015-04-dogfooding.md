---
id: STORY-015-04
epic: EPIC-015
status: review
blocked: false
priority: must
sprint: SPRINT-007
features: [FEATURE-REVIEW-WORKSPACE]
---
# Development project content and release

As the project owner, I want to review real AgentStack screens, assets and repository delivery plans, so the platform can be used to improve itself.

## Acceptance
Given existing imported objects/comments, when refreshing the development catalog, stable IDs and history remain. Given the release, when verifying the original customer project files, no file is missing or changed.

## Tasks
- [x] Implement the vertical scenario
- [x] Verify behavior, accessibility and error states
- [x] Document evidence and limitations

## Definition of done
Relevant tests and independent review pass, production behavior is verified, and human acceptance is not fabricated.

## Verification
See [0.4.0 evidence](../../../docs/releases/0.4.0-verification.md). Production schema 6, 48 real screen captures, six original assets, seven flows and the repository-derived planning catalog are verified. Existing customer rows and original static-file hashes were preserved. Human acceptance remains pending.
