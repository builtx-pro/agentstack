# Workspace experience and first-run onboarding

Status: implementation contract, not a release claim.

## Product goal

Help a solo developer install AgentStack, bring an existing project into it, and guide customers and coding agents without separate setup instructions. Improve the daily workspace with clear illustrations, personal appearance and account security. Existing catalogs, comments, presentations and 3D resources must remain intact.

## Scope and priorities

1. Restore catalog order and make tags actionable; provide RU/EN across application UI (see catalog-and-locales.md).
2. Personal account: editable display name, uploaded avatar, language, light/dark/system theme, accent presets and custom accent with a live preview. Settings belong to the signed-in user and synchronize across devices. Project content is not translated.
3. Security: change password, list/revoke personal sessions, opt-in authenticator TOTP, one-use recovery codes, and a complete second-step login flow. No email/SMS provider is required. A password alone cannot disable enabled MFA.
4. Visual system: generated cohesive illustrations for primary dashboard cards and supporting orientation blocks. Preserve compact conventional action icons, clear semantics and accessible contrast.
5. Installation: one command for a clean supported Debian/Ubuntu VPS, interactive domain/admin input, Docker Compose, automatic TLS reverse proxy, DNS/prerequisite checks, readiness verification and protected credentials. Never overwrite an existing installation or take over occupied ports/services.
6. Guided start: first administrator setup, invited-user registration, create/import project, explanations and direct links for every core area, connect an existing agent, and a dismissible/reopenable checklist based on real project state. Optional steps do not block access to the product.

## Account boundaries

Human sessions may access only their own account endpoints. Project-scoped agent tokens never change a human's profile, credentials, appearance or MFA. Avatar uploads accept bounded raster files, validate actual bytes and dimensions, strip metadata by decoding/re-encoding, and serve authenticated content with nosniff. No arbitrary remote image fetch or SVG execution.

Appearance uses approved accessible presets and a validated custom color. Semantic warning/success/error colors keep their meanings. User settings use optimistic versions to prevent concurrent overwrites.

MFA setup requires current password, expires if unconfirmed, and becomes active only after a valid code. Secrets are encrypted at rest, excluded from public serialization/history/logs, and bound to the account with authenticated encryption. Recovery codes are random, hashed and displayed once. Challenges are short-lived, attempt-limited, single-use and do not grant access before verification. TOTP replay and recovery-code reuse are rejected transactionally. Disabling or replacing factors requires password and a valid factor/recovery code. Password/MFA changes invalidate other active sessions. No automatic enabling of MFA on the owner's live account.

## Installation and registration defaults

An operator supplies a domain already pointing at the VPS; the installer checks DNS and explains remediation. It cannot change an arbitrary registrar account. The initial owner is created through the protected bootstrap path. Team registration uses expiring invitations with explicit membership, not open access to private projects. A new invitee starts with only the invited project's permissions.

Installation works without a host Node.js runtime. The application and migration run in containers. The database has no public port. Existing deployments use documented upgrades and fresh backups rather than running the fresh installer over them. An interrupted installation retains generated credentials and data and reports a recoverable next step.

## Onboarding acceptance

- First login offers a guided overview with skip/resume and an always-accessible help entry.
- Administrators can create a project; permitted members can import a manifest with a preview before applying it. Customers cannot create restricted resources through onboarding.
- Each core function explains what the human does, what an agent can do, and the resulting state: screens/flows/tags, assets, comments and acceptance, docs/rules, planning/progress, repository/CI sync, history, access and agent tokens/MCP.
- Buttons navigate to real destinations. Completion indicators reflect actual data or an explicit personal acknowledgement, not fabricated progress.
- No wizard action changes project content, permissions or token scopes without its normal confirmation and API checks.

## Verification and rollout

Behavioral and isolated PostgreSQL tests cover MFA lifecycle, replay, lockout, recovery, secret isolation, account ownership, avatar bounds, preference conflicts and schema upgrades. Browser tests cover both languages, keyboard navigation, mobile layouts, onboarding roles, login and account flows. Installation tests cover input validation, repeat runs, occupied ports, partial failure and a real disposable clean-host rehearsal where available. Report any unverified DNS/ACME/host behavior explicitly.

Before deployment: back up the database and encryption configuration, verify restore, run security/database/API/test/production gates, build the exact committed revision and verify it live. Catalog ordering backfill changes only order metadata with expected versions, retaining all previous revisions and comment targets.

## References

- [TOTP algorithm, RFC 6238](https://www.rfc-editor.org/rfc/rfc6238)
- [OWASP multifactor authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
