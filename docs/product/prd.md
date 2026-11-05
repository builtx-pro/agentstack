---
doc: prd
project: AgentStack
status: accepted-for-implementation
updated: 2026-11-05
---
# PRD

## Vision
A self-hosted review and delivery workspace shared by developers, customers and coding agents. One object, one conversation, one versioned record of the outcome.

## Jobs to be done
- Solo vibe coder: review generated screens in one pass and hand precise corrections back to the agent.
- Team developer/designer: find current decisions, compare versions and avoid duplicate fixes.
- Customer: review only their project, leave feedback in context and accept results without source-code access.
- Installation admin: manage several projects and access without deploying separate stacks.
- Agent: fetch scoped context and current rules, claim work, submit evidence and preserve human ownership.

## Scope (MoSCoW)
Must: catalog/flows/search/tags; assets/usage/versions; shared reviews; documents/rules; planning and proposals; progress; history/archive/restore; access isolation; MCP/CLI; easy self-host; migration; per-project dashboards; version comparison.
Should: Git manifest exchange, review context bundles, onboarding recipes and audit filtering.
Could: customer subdomain aliases, external SSO, webhooks from CI and signed evidence providers.
Won't in initial release: hosted SaaS billing, autonomous code execution, built-in paid LLM calls, arbitrary server-side git runners, a second database backend, real-time coediting.

## Measures
No baseline speed measurements exist. Track observed time from comment to ready-for-review and human acceptance after real usage; do not invent improvement percentages. Acceptance targets: no lost migration records, no unauthorized cross-project access in the negative suite, a documented and reproducible fresh installation and restore, all core workflows covered in browser/API tests.

## Risks
Untrusted preview code; accidental publication of private assets; conflicting edits; false completion claims; double-counted progress; archive/history exposing formerly shared material. See the specification and security model for controls.

## Decisions delegated by owner
Custom Mantine UI, monorepo, flexible safe access, additional useful features and technical implementation are delegated. Product name AgentStack confirmed. License choice pending; no licensing claim until confirmed.
