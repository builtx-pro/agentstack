# API implementation contract v1

This contract coordinates the first implementation. All endpoints are under `/api/v1`. JSON responses; errors `{error:{code,message}}`. UUID internal IDs, opaque keyset cursors, max limit 100. Success detail is an object; lists are `{items,nextCursor}`. APIs never return credential hashes or internal storage paths.

## Authentication
- `POST /auth/login {email,password}` → `{user}` and HttpOnly session cookie.
- `POST /auth/logout` invalidates session.
- `GET /auth/me` → `{user:{id,email,name,isAdmin},csrfToken}`.
- Browser writes send exact Origin and `X-AgentStack-Request: 1` (JSON only); strict origin allowlist. Sessions are same-site, host-only.
- CLI/MCP use `Authorization: Bearer` project tokens, never cookies. Session and token principal share authorization functions. Token operations cannot elevate privileges or accept own results.
- Bootstrap is a local operator command; no public unprotected create-admin endpoint.

## Projects and access
- `GET /projects` visible projects.
- `POST /projects {name,slug,description?}` admin only.
- `GET /projects/:projectId` → project + current role.
- `PATCH /projects/:projectId {expectedVersion,name?,description?,archived?}` admin.
- `GET /projects/:projectId/members`, `POST .../members {userId,role}` and `DELETE .../members/:userId` admin only; audit every change.
- `GET /users`, `POST /users {email,name,password,isAdmin?}` admin only. Password changes invalidate sessions.
- `POST /projects/:projectId/invitations {email,role,expiresInHours}` admin; returns one-time invitation string; `POST /auth/accept-invitation {token,name,password}`.
- `POST /projects/:projectId/tokens {name,scopes,expiresInDays}` human admin/developer. Returns token once.
- `GET .../tokens` metadata only, `DELETE .../tokens/:id` revoke.

## Unified versioned targets
`ObjectKind = screen | flow | asset | document | rule | wave | epic | story | sprint | feature | proposal`.

`ProjectObject = {id,projectId,key,kind,title,description,tags:string[],visibility:'team'|'customer',status:'backlog'|'ready'|'in_progress'|'review'|'done',archived:boolean,version:number,data:object,createdAt,updatedAt}`.

Each kind has a Zod data schema (no arbitrary server-side code):
- screen: `{screenId?:string,variant?,palette?,frame?:'mobile'|'desktop',imageFileId?,previewUrl?,sourcePath?,assetIds?:string[]}`
- asset: `{fileId?,category?,source?,license?,variant?}`
- flow: `{screenIds:string[],role?,phase?}`
- document/rule: `{markdown:string}`
- wave: `{}`
- epic: `{waveId?:string}`
- sprint: `{goal?:string,startDate?:string,endDate?:string}`
- story: `{epicId?,sprintId?,featureIds?:string[],assigneeId?,priority?:'low'|'normal'|'high'|'urgent',blocked?:boolean,checklist?:[{id,text,done}]}`
- feature: `{}`
- proposal: `{proposalType?:'feature'|'fix',linkedStoryId?:string,decision?:string}`

All referenced objects must exist in the SAME project with correct kinds; hidden linked objects never leak through serialization. Cross-field/reference validation is a service concern as well as schema validation. Rule mutations by agents are forbidden; propose changes using notes instead. Human edits to rules are explicit and versioned.

- `GET /projects/:projectId/objects?kind=&q=&tag=&status=&archived=&cursor=&limit=`
- `POST .../objects {key,kind,title,description?,tags?,visibility?,status?,data}` with `Idempotency-Key`.
- `GET .../objects/:id`
- `PATCH .../objects/:id {expectedVersion,title?,description?,tags?,visibility?,status?,archived?,data?}` data replacement, validated by existing kind. Key/kind/project immutable.
- `GET .../objects/:id/history` → `{items:[{id,version,actorName,source,createdAt,summary,snapshot}],nextCursor}`. Sensitive fields excluded. Current target ACL gates history.
- `POST .../objects/:id/restore {expectedVersion,revisionVersion,reason}` creates new revision. No automatic permission restoration; visibility remains current.
- `POST .../objects/:id/convert {expectedVersion}` proposal→story idempotent conversion, preserving proposal and linkage.

## Files
- `POST /projects/:projectId/files` bounded multipart upload → `{id,name,mimeType,size,sha256,url}`. Supported safe image MIME, detect type from bytes; no executable HTML upload on control origin.
- `GET /projects/:projectId/files/:fileId` authenticated bytes with safe content headers; membership + referencing-target visibility. Do not expose unattached files to customers. No public static upload mount. File IDs immutable.
- External preview URLs are validated HTTP(S); no server fetch. Active embed is sandboxed without allow-same-origin. Explicit link opens external origin with noopener. Never proxy arbitrary URL.

## Notes and agent queue
`ReviewNote = {id,projectId,targetId,targetVersion,body,authorName,visibility:'team'|'customer',status:'open'|'in_progress'|'ready_for_review'|'resolved',version,claimedBy?,claimExpiresAt?,result?,createdAt,updatedAt}`.
Result `{summary,revision?,previewUrl?,checks:[{name,result:'passed'|'failed'|'not_run',details?}],evidenceSource:'agent'|'human'}`. Token submissions always agent-reported; cannot claim CI attestation.

- `GET /projects/:projectId/notes?targetId=&status=&cursor=&limit=`.
- `POST .../notes {targetId,targetVersion,body,visibility?}` with `Idempotency-Key`. Target must be currently readable; old revision may be selected if valid.
- `PATCH .../notes/:id {expectedVersion,body}` own author/admin, history kept.
- `POST .../notes/:id/transition {expectedVersion,action:'claim'|'submit'|'resolve'|'reopen'|'release',reason?,result?}`.
- `GET .../notes/:id/history` revision/event list.
Claim atomic and expires; only claimant or authorized human may submit/release active lease. Submit requires summary + checks, status→ready_for_review. Resolve human only with reason, status must be ready_for_review. Reopen human with reason. No bypass through object status CRUD.

## Reporting/context/audit
- `GET /projects/:projectId/progress` → `{total,done,percent,byStatus,groups:[{id,title,kind,total,done,percent}],notes:{open,in_progress,ready_for_review,resolved},timeline:[{date,total,done}]}`. Unique visible active stories only. No empty=100%, no fake historical data.
- `GET /projects/:projectId/activity` paginated safe event summaries for visible objects. Do not leak member/token metadata to customers.
- `GET /projects/:projectId/context` → project, capabilities, rules, documents, planning and open notes bounded with pagination/truncation metadata. Team-only token context, explicit fetch of remaining pages.
- `GET /capabilities` supported API/object kinds/tools, server version.
- `GET /health` process health, `GET /ready` DB/migration readiness.

## Import/export
Versioned manifest `{schemaVersion:1,project:{name,slug},objects:[...drafts with key references],files:[],source?:{commit,branch}}`. Generic import uses stable keys, never overwrites without supplied baseVersion; per-record report and transactional batch. CLI resolves references in two passes. Legacy importer has separate provenance/mapping tables, preserving timestamps/version/event history and ensuring repeat safety. No customer content is committed to this repository.

## Frontend
Single custom Mantine theme, light/dark, neutral slate background + violet accent. Sidebar: Overview, Screens, Assets, Reviews, Documents, Plan, Features, History, Settings. Project switcher and role-aware UI. Use actual API data, explicit empty/loading/error states. New-object dialogs and working edits are part of the feature, not just read-only mockups. Typed URL filters; full viewer with comments on right; editor/history/restore; task checklist/planning dashboards. UI status labels human readable. English default with Russian project content supported.

## Invariants from architecture review
- Each screen object represents one `(screenId,variant,palette)` view; key is stable and unique within project. Versions/comments attach to the view, not the base screen alone.
- History and file access intersect current target visibility AND revision visibility. Publishing a document does not publish its old team-only history.
- Restore only content (title, description, tags, safe kind data), never status/visibility/archived/claims/result/acceptance. Agent tokens cannot mutate or restore rules, memberships or projects. They cannot set story status done (submit review instead).
- `source`, identity, timestamps and evidenceSource are server-derived. Agent tokens remain agents regardless of owner isAdmin.
- An archived wave/epic removes descendant stories from effective active progress scope. Archived sprints do not remove stories from project totals. Features are many-to-many; no duplicate IDs.
- Privacy applies transitively to relationships; clients never receive hidden referenced IDs. Archive history is preserved. No hard-delete business objects.
- Migration preserves private principal/request/event IDs in private provenance, never public DTOs. Imported display names are explicitly marked unverified.

## Integrated contract revisions
- User DTOs include `version` and `disabled`. User PATCH requires `expectedVersion`. Human admins can read `/admin/activity` and `/users/:id/history`; password changes record only `passwordChanged`, never credentials.
- Membership creation uses `expectedVersion:0`; update/revoke/regrant uses the latest version. DELETE accepts `{expectedVersion}` and soft-revokes. Admin `GET .../members?includeRevoked=true` returns `revokedAt` and versions.
- Flow data includes optional `stateIds` for alternative states separate from ordered `screenIds`.
- Context responses have a 1 MiB budget and explicit `nextCursors`, `continuations`, `omittedObjects` and `contextBudget`. Fetch remaining rules before executing work.
- Uploaded files are deduplicated by verified content within a project; unchanged file manifests are idempotent across dry-run and apply.
- `TRUST_PROXY` defaults to no forwarded-header trust. Only explicitly configured proxy addresses/CIDRs are trusted. Authenticated API limits use principals; login has its own IP limit.

- Claims record `claimedRuleRevisions?: [{id,version}] | null`. The server supplies the snapshot and checks it at submit under the same project rule lock as rule edits. `rules_changed` and `rules_snapshot_required` are recoverable conflicts requiring a deliberate new claim. Customer DTOs omit internal rule IDs.
- Context also contains bounded `activeClaims` with continuation metadata.
- `GET /projects/:projectId/legacy?kind=screen|asset&key=...&note=...` resolves authorized Concepts bookmarks to `{targetId,section,noteId?}` without returning private provenance.
