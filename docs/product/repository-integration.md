# Repository connection and reviewed synchronization

## Decision
Support GitHub.com, GitLab.com and a local/CI producer. All modes create a bounded changeset. Only a human applies it; agents and CI cannot impersonate a human, accept their own review result or modify active rules implicitly. Refresh does not change existing project objects. Missing source files are reported and never delete data. Object edits remain ordinary versioned API edits with comments/history intact.

## Provider boundary
Construct provider URLs from a validated provider/repository/branch tuple. Only api.github.com and gitlab.com are used; reject redirects, ignore provider-supplied fetch URLs, validate returned SHA/path/content/URL and bound response bytes. At most 200 Markdown files, 128 KiB each, 4 MiB total; tree 8 MiB/50,000 entries; 60s total, 15s per request; concurrency four. No clone, checkout, hooks, shell commands, packages or provider write APIs run on the server. Pipeline summaries only, no logs/artifacts/secrets.

Private tokens are write-only configuration. AES-256-GCM with fresh96-bit nonce,32-byte REPOSITORY_ENCRYPTION_KEY, AAD project/connection binds ciphertext. Never return or audit plaintext/ciphertext. Public connections work without key; private credential writes require it. Back up the key with protected deployment configuration. Rotation means re-enter credentials after key change; key loss must not silently erase tokens.

## Tables, schema4
- repository_connections: project-scoped config/version, credential ciphertext, archive flag, creator, timestamps. Maximum20 per project. Config changes append sanitized audit before/after.
- repository_snapshots: immutable project/connection ID, source commit/branch, files-derived drafts, pipeline summaries, source provider/reported, config version and actor/time. Maximum4MiB input; retained history. Queries exclude raw contents from list responses.
- repository_bindings: composite project/connection/source key -> object ID, last source path/hash and applied object version/hash. Source keys are stable frontmatter IDs when present; path-hash otherwise. Composite FKs prevent cross-project links.
Existing immutable audit_events and object_revisions record connection changes and applies. ForceRLS and explicit tenant policies/grants for all new tables. No new privileged bypass role.

## API contract
Base /api/v1/projects/:projectId/repositories.
GET list and GET /:id: admin/developer; no credentials. POST create and PATCH /:id: human installation admin, CAS. Provider enum github/gitlab/local; repository owner/name, nested GitLab namespace or local label; branch, label, roots, optional token, sharePipelines.
POST /:id/refresh {expectedVersion}: developer/agent write scope can fetch/stage remote snapshot. Network work is outside database transaction; recheck membership/config version before commit.
POST /:id/snapshots {expectedVersion,branch,commit,files:[{path,content}],pipelines?}: local/CI stage, labelled reported. Agent cannot call apply.
GET /:id/snapshots: bounded summaries. GET /:id/snapshots/:sid: full changeset with current version/conflict state, pending draft and provenance.
POST /:id/snapshots/:sid/apply {expectedVersion,entries:[{key,expectedObjectVersion,resolveConflict?}]}: human only. Selected entries applied atomically through existing object service. Base versions must still match; conflicts need explicit resolveConflict. Rule changes remain human actions; notes are never resolved by sync.
GET /repositories/pipelines: safe customer summaries only for connections explicitly shared. Do not expose private repository paths/URLs to customers. Team sees source URL/commit.

## Mapping
Markdown under configured roots only. Flat or conventional YAML frontmatter parsed with alias expansion disabled; known fields validated; unknown keys ignored. Explicit kind or ID prefixes WAVE-/EPIC-/STORY-/SPRINT-/FEATURE- infer work item kind. Ordinary docs use first H1 or filename. AGENTS.md/CLAUDE.md/rules path become rule drafts. Existing PM fields status in-progress -> in_progress, blocked flag, epic/sprint/wave and milestone relationships, priority and Markdown checklists map to typed targets. Preserve complete body as a linked document for work items whose schema has no markdown field. Stable IDs preserve comments across path moves. Duplicate IDs fail staging. Unresolved references reject application atomically; stage the required parents and select them together.

If both source and web changed, application requires explicit conflict resolution. If only the web changed, unchanged source preserves the web edit. Unchanged import is idempotent. Partial selections must include new referenced parent targets or reference existing bound parents.

## CLI and CI
CLI reads committed HEAD Markdown with fixed git argv, no shell interpolation or project execution, sends raw files to same stage endpoint; it may trigger remote refresh instead. Agent/CI tokens need read/write; apply requires explicit human session. GitHub Actions and GitLab CI templates stage after a push and show returned changeset identifiers. Repo-provided pipeline data is labelled reported; provider fetched data is separately labelled provider.

## UI
Repository settings form (provider/repo/branch/roots/token) and connection status. Refresh button stages with commit, source and file counts. Changeset lists new/changed/conflict/missing rows with source/current details and checkboxes; human Apply creates revisions. Delivery plan and Knowledge show source links and last imported commit via binding lookup. Dashboard/plan show recent pipeline summaries plus a provider link for team users. Provider reads run on manual refresh or CI-triggered refresh. An open pipeline view refreshes cached API summaries every 60 seconds without fetching the provider or reloading the catalog.

## References
https://docs.github.com/en/rest/git/trees#get-a-tree
https://docs.github.com/en/rest/git/blobs#get-a-blob
https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository
https://docs.gitlab.com/api/repositories/
https://docs.gitlab.com/api/pipelines/
