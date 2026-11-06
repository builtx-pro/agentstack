# Workspace organization and task boards

Status: implementation contract, 2026-11-06. Extends the existing product, not a replacement of migrated customer data.

## Confirmed product decisions

- A warm orange default accent (`#d9480f`) replaces the default purple for new preferences. Existing explicitly saved preferences remain intact. Light/dark/system and custom accents remain supported.
- Account settings use a responsive side navigation: profile, appearance, security, sessions and history. Switching sections preserves entered drafts. Dense project settings follow the same pattern.
- Dashboard/project illustrations become large decorative parts of the card composition with a protected text area. Generate new original orange/amber/graphite illustrations; no customer assets in the public repository.
- Standard form controls, filters and buttons use a common 42px height. Dense secondary icon actions may use 36px with accessible names. Long labels wrap or use a suitable layout; they are not clipped.
- Planning has informative wave/epic/sprint disclosures with child work items and actual progress. Opening details is a separate action. Markdown descriptions render by default with an explicit plain-source mode; raw HTML is never executed.
- Long document/rule lists load real server pages with filters, continuation skeletons, an automatic scroll trigger and a keyboard-accessible Load more fallback. Selected details load independently. Graph-dependent planning remains bounded in rendered rows; virtualization is used only if measurement warrants it.
- Screen catalogs support desktop and mobile frames and a URL-persisted device filter. Existing unspecified frames retain legacy mobile behavior.
- A project task board displays stories; a separate agent board displays review notes whose columns derive from existing claim/submission/human acceptance events. No simulated agent activity and no automatic acceptance.
- My tasks combines private tasks without a project and accessible project stories assigned to the signed-in user. Personal tasks are owner-only, including history; project tokens never receive them. Assigned items retain project authorization and version conflicts.
- Populate the private AgentStack development project from real repository epics/stories/docs and real application screenshots/assets. Preserve IDs, comments and history; import idempotently with version checks. Do not invent completed work or execution dates.

## Architecture and verification

Reuse PostgreSQL/API/SDK/MCP and Mantine/TanStack stack. Schema 6 adds personal tasks with owner RLS and immutable history, plus the default accent for new users. Project board statuses are existing object/note statuses, not a second source of truth. Personal list pagination is bounded; assigned collection checks membership and current assignment without weakening generic project routes. Writes require expectedVersion. Private task access is session-only; API/MCP project permissions remain unchanged.

Acceptance: realistic desktop/mobile RU/EN browser coverage, keyboard/tab/disclosure operation, dirty-form preservation, production light/dark/custom-accent contrast, no loading loops, pagination continuation and mutation cache coherence. Server tests cover two owners, inaccessible/removed projects, assignment changes, personal history, retries and stale versions. Preserve the original customer project data and static artifacts on deployment; backup and rehearsal before schema migration.

Implementation is tracked in EPIC-015. Human acceptance remains separate from implementation verification. Full clean-VPS DNS/ACME rehearsal from EPIC-014 remains an explicitly open limitation.
