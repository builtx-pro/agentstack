# Personal and project task boards

All endpoints use `/api/v1`. A personal board requires a human session. Project-scoped bearer tokens receive `403`, including tokens issued by an administrator. The API never shares a user's personal tasks with other users or installation administrators.

## Personal board

`GET /tasks?source=all|personal|assigned&status=&q=&archived=false|true|all&limit=50&cursor=` returns `{items,nextCursor}`. The default source is `all`, default archive filter is `false`, and the maximum page size is 100. Follow the opaque cursor; ordering is source then stable UUID. Search matches title, description and tags literally, case-insensitively. Assigned tasks belong only to currently accessible, unarchived projects; customer members see only customer-visible assignments. Membership revocation takes effect on the next request. Archival filtering refers to each task's own archived flag.

Each item is:

```ts
type TaskItem = {
  source: 'personal' | 'project';
  id: string;
  projectId: string | null;
  projectName: string | null;
  canEdit: boolean;
  title: string;
  description: string;
  status: 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  blocked: boolean;
  checklist: {id: string; text: string; done: boolean}[];
  tags: string[];
  archived: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};
```

`canEdit` is an interface hint, not authorization. Every mutation checks current permissions again. Project assignments displayed to customers are read-only. The board does not clone stories: project work continues to use its original ID, comments, history and authorization.

- `POST /tasks {id,title,description?,status?,priority?,blocked?,checklist?,tags?}` creates a personal task. Generate `id` once as a UUID and retain it during retries. The same normalized payload and ID returns the current task without a duplicate revision (`200` for a retry; `201` for creation). Reusing that ID with different creation input returns `409`.
- `GET /tasks/:id` reads one of the current user's personal tasks. Foreign or missing tasks return `404`.
- `PATCH /tasks/:id {expectedVersion,title?,description?,status?,priority?,blocked?,checklist?,tags?,archived?}` updates a personal task. Stale versions return `409`; recover by reading current state and preserving the user's draft. Archive and restore are versioned updates; no destructive delete route is exposed.
- `GET /tasks/:id/history?limit=&cursor=` returns immutable version snapshots newest first. This cursor represents a version boundary and is independent of the mixed-board cursor.

Project-source items must be edited via the existing project object API, not `/tasks/:id`. When updating object `data`, first read the whole current object so that replacing its JSON preserves epic, sprint, feature and assignment links. A full object patch is still subject to expectedVersion and project permission checks.

## Agent queue and project kanban

Project stories use `GET /projects/:projectId/objects?kind=story`. Their stored work status determines the column. Agent review tasks use `GET /projects/:projectId/notes` and the existing claim/submit/release/resolve transitions. Claim moves a note into `in_progress`; submit with actual checks moves it into `ready_for_review`; only explicit human acceptance resolves it. A screen comment does not silently complete a linked story.

MCP exposes `list_project_tasks` for scoped story pages and the existing `list_review_items`, `claim_review_item`, `release_review_item` and `submit_review_result`. No personal-task MCP tools are published. SDK human-session methods are `tasks`, `personalTask`, `createPersonalTask`, `updatePersonalTask`, and `personalTaskHistory`.

## Storage and deployment

Migration 6 adds owner-scoped personal tasks and immutable history with forced RLS. A dedicated human-only board transaction enables a narrow additional SELECT policy for the current user's assigned stories; it does not enable project writes or revision reads across projects. Queries remain bounded and use a partial assignment index. Project endpoints continue using the existing tenant context.

The migration also changes the account accent default to warm orange (`#d9480f`) for newly created profiles. Existing preferences are untouched. An older application fails readiness against the newer schema; roll back application changes with a schema-compatible build instead of restoring an old database over new tasks.
