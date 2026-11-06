---
id: STORY-015-03
epic: EPIC-015
status: review
blocked: false
priority: must
sprint: SPRINT-007
features: [FEATURE-TASK-BOARDS]
---
# Project and private task boards

As a developer, I want to manage project work, agent reviews and my private tasks, so one board reflects real progress without exposing private work.

## Acceptance
Given two users, when either queries private tasks/history, the other user records remain inaccessible. Given a real agent claim and evidence submission, when refreshing the agent board, the corresponding card moves without accepting itself.

## Tasks
- [x] Implement the vertical scenario
- [x] Verify behavior, accessibility and error states
- [x] Document evidence and limitations

## Definition of done
Relevant tests and independent review pass, production behavior is verified, and human acceptance is not fabricated.

## Verification
See [0.4.0 evidence](../../../docs/releases/0.4.0-verification.md). Human acceptance remains pending.
