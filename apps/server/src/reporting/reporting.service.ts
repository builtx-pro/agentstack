import type { Context } from "../db/database.service.js";
import type { ProjectObject } from "@agentstack/contracts";
import { objectKindSchema } from "@agentstack/contracts";
import {
  objectDto,
  isCustomer,
  type ObjectRow,
  readableReferences,
} from "../objects/objects.service.js";
import { getProject } from "../projects/projects.service.js";
import { listNotes } from "../reviews/reviews.service.js";
import { decodeCursor, page } from "../shared/pagination.util.js";
import { forbidden } from "../shared/errors.js";
export const capabilities = {
  version: "0.1.0",
  apiVersion: 1,
  objectKinds: objectKindSchema.options,
  features: [
    "projects",
    "screens",
    "assets",
    "reviews",
    "documents",
    "planning",
    "history",
    "archive",
    "restore",
    "manifest-import",
    "progress",
    "context",
  ],
  mcpTransport: "stdio",
};
function activeStories(objects: ProjectObject[]) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  return objects.filter((o) => {
    if (o.kind !== "story" || o.archived) return false;
    const epic = byId.get(String(o.data.epicId));
    if (epic?.archived) return false;
    const wave = epic ? byId.get(String(epic.data.waveId)) : undefined;
    return !wave?.archived;
  });
}
function counts(stories: ProjectObject[]) {
  const total = stories.length,
    done = stories.filter((s) => s.status === "done").length;
  return { total, done, percent: total ? Math.round((100 * done) / total) : 0 };
}
export async function progress(ctx: Context) {
  const rows = (
    await ctx.db.query("SELECT * FROM objects WHERE project_id=$1", [
      ctx.projectId,
    ])
  ).rows as ObjectRow[];
  const all = rows.map(objectDto);
  const visible = (o: ProjectObject) =>
    !isCustomer(ctx) || (o.visibility === "customer" && o.kind !== "rule");
  const stories = activeStories(all).filter(visible);
  const byStatus: Record<string, number> = {
    backlog: 0,
    ready: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    blocked: 0,
  };
  for (const s of stories) {
    byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    if (s.data.blocked) byStatus.blocked! += 1;
  }
  const groups = all
    .filter(
      (o) =>
        ["wave", "epic", "sprint", "feature"].includes(o.kind) &&
        !o.archived &&
        visible(o),
    )
    .map((g) => {
      const ids =
        g.kind === "wave"
          ? new Set(
              all
                .filter((o) => o.kind === "epic" && o.data.waveId === g.id)
                .map((o) => o.id),
            )
          : null;
      const matched = stories.filter((s) =>
        g.kind === "wave"
          ? ids!.has(String(s.data.epicId))
          : g.kind === "epic"
            ? s.data.epicId === g.id
            : g.kind === "sprint"
              ? s.data.sprintId === g.id
              : (s.data.featureIds as string[] | undefined)?.includes(g.id),
      );
      return { id: g.id, title: g.title, kind: g.kind, ...counts(matched) };
    });
  const noteRows = (
    await ctx.db.query(
      "SELECT n.status,count(*)::int AS count FROM notes n JOIN objects o ON o.project_id=n.project_id AND o.id=n.target_id JOIN object_revisions r ON r.project_id=n.project_id AND r.object_id=n.target_id AND r.version=n.target_version WHERE n.project_id=$1 AND ($2=false OR (n.visibility='customer' AND o.visibility='customer' AND r.visibility='customer' AND o.kind<>'rule')) GROUP BY n.status",
      [ctx.projectId, isCustomer(ctx)],
    )
  ).rows;
  const notes = { open: 0, in_progress: 0, ready_for_review: 0, resolved: 0 };
  for (const n of noteRows) notes[n.status as keyof typeof notes] = n.count;
  // Reconstruct observed daily scope from immutable revisions. No synthetic pre-install history.
  // Keep private intervals internally for currently visible stories; filtering revisions first
  // would carry an earlier public completion through the hidden interval. Only aggregates escape.
  const history = (
    await ctx.db.query(
      "SELECT r.snapshot,r.created_at FROM object_revisions r JOIN objects o ON o.id=r.object_id AND o.project_id=r.project_id WHERE r.project_id=$1 AND r.snapshot->>'kind' IN ('story','epic','wave') AND ($2=false OR r.snapshot->>'kind' IN ('epic','wave') OR o.visibility='customer') ORDER BY r.created_at,r.version",
      [ctx.projectId, isCustomer(ctx)],
    )
  ).rows;
  const state = new Map<string, ProjectObject>(),
    daily = new Map<string, { date: string; total: number; done: number }>();
  let observedVisibleStory = false;
  for (const h of history) {
    state.set(h.snapshot.id, h.snapshot);
    const date = new Date(h.created_at).toISOString().slice(0, 10);
    const historicalStories = activeStories([...state.values()]).filter(
      visible,
    );
    observedVisibleStory ||= [...state.values()].some(
      (item) => item.kind === "story" && visible(item),
    );
    if (!isCustomer(ctx) || observedVisibleStory)
      daily.set(date, { date, ...counts(historicalStories) });
  }
  return {
    ...counts(stories),
    byStatus,
    groups,
    notes,
    timeline: [...daily.values()],
  };
}
export async function activity(ctx: Context, limit: number, cursor?: string) {
  const rows = (
    await ctx.db.query(
      "SELECT e.id,e.actor_name AS \"actorName\",e.source,e.action,e.target_id AS \"targetId\",e.summary,e.created_at AS \"createdAt\",e.data FROM audit_events e LEFT JOIN objects o ON o.id=e.target_id AND o.project_id=e.project_id WHERE e.project_id=$1 AND ($2=false OR (e.visibility='customer' AND o.visibility='customer' AND o.kind<>'rule')) AND ($3::uuid IS NULL OR (e.created_at,e.id)<(SELECT created_at,id FROM audit_events WHERE id=$3 AND project_id=$1)) ORDER BY e.created_at DESC,e.id DESC LIMIT $4",
      [ctx.projectId, isCustomer(ctx), decodeCursor(cursor), limit + 1],
    )
  ).rows;
  return page(rows, limit);
}
export async function context(ctx: Context) {
  if (isCustomer(ctx)) throw forbidden();
  const maxBytes = 1024 * 1024,
    payloadBudget = maxBytes - 32768;
  const sectionKinds = {
    rules: ["rule"],
    documents: ["document"],
    planning: ["wave", "epic", "story", "sprint", "feature", "proposal"],
  } as const;
  const project = await getProject(ctx);
  const result: {
    project: typeof project;
    capabilities: typeof capabilities;
    rules: ProjectObject[];
    documents: ProjectObject[];
    planning: ProjectObject[];
    notes: Awaited<ReturnType<typeof listNotes>>["items"];
    activeClaims: Awaited<ReturnType<typeof listNotes>>["items"];
    truncated: Record<string, boolean>;
    nextCursors: Record<string, string | null>;
    continuations: Record<
      string,
      {
        path: string;
        query: Record<string, string | number>;
        filterKinds?: string[];
      }
    >;
    omittedObjects: Array<{
      id: string;
      key: string;
      kind: string;
      title: string;
      version: number;
      path: string;
      reason: "context_budget";
    }>;
    nextNoteCursor: string | null;
    contextBudget: { maxBytes: number; usedBytes: number; complete: boolean };
    instructions: string;
  } = {
    project,
    capabilities,
    rules: [],
    documents: [],
    planning: [],
    notes: [],
    activeClaims: [],
    truncated: {
      rules: false,
      documents: false,
      planning: false,
      notes: false,
      activeClaims: false,
    },
    nextCursors: { rules: null, documents: null, planning: null, notes: null, activeClaims: null },
    continuations: {},
    omittedObjects: [],
    nextNoteCursor: null,
    contextBudget: { maxBytes, usedBytes: 0, complete: true },
    instructions:
      "Read all omittedObjects and continuation pages before acting on project rules. Context-budget omissions are metadata only, not truncated document content.",
  };
  let used = Buffer.byteLength(JSON.stringify(result));
  for (const section of ["rules", "documents", "planning"] as const) {
    const candidates = (
      await ctx.db.query(
        "SELECT * FROM objects WHERE project_id=$1 AND NOT archived AND kind=ANY($2::text[]) ORDER BY id LIMIT 26",
        [ctx.projectId, sectionKinds[section]],
      )
    ).rows as ObjectRow[];
    let consumed = 0,
      lastId: string | null = null;
    for (const row of candidates.slice(0, 25)) {
      const object = objectDto(row),
        size = Buffer.byteLength(JSON.stringify(object)) + 1;
      consumed++;
      lastId = object.id;
      if (used + size > payloadBudget) {
        result.omittedObjects.push({
          id: object.id,
          key: object.key,
          kind: object.kind,
          title: object.title,
          version: object.version,
          path: `/projects/${ctx.projectId}/objects/${object.id}`,
          reason: "context_budget",
        });
        result.truncated[section] = true;
        break;
      }
      result[section].push(object);
      used += size;
    }
    if (consumed < candidates.length) result.truncated[section] = true;
    if (result.truncated[section]) {
      const cursor = lastId ? Buffer.from(lastId).toString("base64url") : null;
      result.nextCursors[section] = cursor;
      result.continuations[section] = {
        path: `/projects/${ctx.projectId}/objects`,
        query: {
          archived: "false",
          limit: 100,
          ...(cursor ? { cursor } : {}),
          ...(section === "rules"
            ? { kind: "rule" }
            : section === "documents"
              ? { kind: "document" }
              : {}),
        },
        ...(section === "planning"
          ? { filterKinds: [...sectionKinds.planning] }
          : {}),
      };
    }
  }
  for (const {section,status,limit} of [
    {section:"notes",status:"open",limit:100},
    {section:"activeClaims",status:"in_progress",limit:25},
  ] as const) {
    const notes = await listNotes(ctx, { status, limit });
    let consumedNotes = 0, lastNoteId: string | null = null;
    for (const note of notes.items) {
      const size = Buffer.byteLength(JSON.stringify(note)) + 1;
      if (used + size > payloadBudget) break;
      result[section].push(note);
      used += size;
      consumedNotes++;
      lastNoteId = note.id;
    }
    result.truncated[section] = consumedNotes < notes.items.length || Boolean(notes.nextCursor);
    if (result.truncated[section]) {
      const cursor = lastNoteId ? Buffer.from(lastNoteId).toString("base64url") : null;
      result.nextCursors[section] = cursor;
      if(section === "notes") result.nextNoteCursor = cursor;
      result.continuations[section] = {
        path: `/projects/${ctx.projectId}/notes`,
        query: { status, limit, ...(cursor ? { cursor } : {}) },
      };
    }
  }
  result.contextBudget.complete = !Object.values(result.truncated).some(
    Boolean,
  );
  result.contextBudget.usedBytes = Buffer.byteLength(JSON.stringify(result));
  // Account for the usedBytes digits themselves; the reserved metadata budget keeps this under maxBytes.
  result.contextBudget.usedBytes = Buffer.byteLength(JSON.stringify(result));
  return result;
}
