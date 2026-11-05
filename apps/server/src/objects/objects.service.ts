import { randomUUID } from "node:crypto";
import type { Context } from "../db/database.service.js";
import { canEdit, human } from "../db/database.service.js";
import {
  objectDataSchemas,
  type ProjectObject,
  type ObjectDraft,
  type ObjectPatch,
  type ObjectKind,
  type listQuerySchema,
} from "@agentstack/contracts";
import { z } from "zod";
import {
  AppError,
  missing,
  conflict,
  forbidden,
  parse,
} from "../shared/errors.js";
import { audit } from "../shared/audit.service.js";
import { lockProjectRules } from "../rules/rule-snapshot.service.js";
import { decodeCursor, page } from "../shared/pagination.util.js";
export type ObjectRow = {
  id: string;
  project_id: string;
  key: string;
  kind: ObjectKind;
  title: string;
  description: string;
  tags: string[];
  visibility: "team" | "customer";
  status: ProjectObject["status"];
  archived: boolean;
  version: number;
  data: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};
export const objectDto = (row: ObjectRow): ProjectObject => ({
  id: row.id,
  projectId: row.project_id,
  key: row.key,
  kind: row.kind,
  title: row.title,
  description: row.description,
  tags: row.tags,
  visibility: row.visibility,
  status: row.status,
  archived: row.archived,
  version: row.version,
  data: row.data,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});
export const referenceKinds: Record<string, ObjectKind> = {
  assetIds: "asset",
  screenIds: "screen",
  stateIds: "screen",
  waveId: "wave",
  epicId: "epic",
  sprintId: "sprint",
  featureIds: "feature",
  linkedStoryId: "story",
};
export const isCustomer = (ctx: Context) => ctx.role === "customer";
export async function readObjectRow(
  ctx: Context,
  id: string,
  lock = false,
): Promise<ObjectRow> {
  const row = (
    await ctx.db.query(
      `SELECT * FROM objects WHERE project_id=$1 AND id=$2 AND ($3=false OR (visibility='customer' AND kind<>'rule')) ${lock ? "FOR UPDATE" : ""}`,
      [ctx.projectId, id, isCustomer(ctx)],
    )
  ).rows[0];
  if (!row) throw missing();
  return row;
}
export async function readableReferences(
  ctx: Context,
  snapshot: ProjectObject,
): Promise<ProjectObject> {
  if (!isCustomer(ctx)) return snapshot;
  const result = { ...snapshot, data: { ...snapshot.data } };
  const allRefs = Object.keys(referenceKinds).flatMap((k) =>
    Array.isArray(result.data[k])
      ? (result.data[k] as string[])
      : typeof result.data[k] === "string"
        ? [result.data[k] as string]
        : [],
  );
  if (allRefs.length) {
    const rows = (
      await ctx.db.query(
        "SELECT id FROM objects WHERE project_id=$1 AND id=ANY($2::uuid[]) AND visibility='customer' AND kind<>'rule'",
        [ctx.projectId, allRefs],
      )
    ).rows;
    const allowed = new Set(rows.map((r) => r.id));
    for (const key of Object.keys(referenceKinds)) {
      const value = result.data[key];
      if (Array.isArray(value))
        result.data[key] = value.filter((id) => allowed.has(id));
      else if (typeof value === "string" && !allowed.has(value))
        delete result.data[key];
    }
  }
  delete result.data.assigneeId;
  delete result.data.sourcePath;
  return result;
}
export async function getObject(ctx: Context, id: string) {
  return readableReferences(ctx, objectDto(await readObjectRow(ctx, id)));
}
export async function validateData(
  ctx: Context,
  kind: ObjectKind,
  data: Record<string, unknown>,
  pending?: Map<string, ObjectKind>,
  dryFiles?: Set<string>,
) {
  const validated = parse<unknown>(objectDataSchemas[kind], data) as Record<
    string,
    unknown
  >;
  for (const [field, expected] of Object.entries(referenceKinds)) {
    const v = validated[field];
    const ids = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    for (const id of ids) {
      if (typeof id !== "string" || !z.uuid().safeParse(id).success)
        throw new AppError(
          422,
          "invalid_reference",
          `Invalid ${field} reference.`,
        );
      if (pending?.get(id) === expected) continue;
      const r = (
        await ctx.db.query(
          "SELECT kind FROM objects WHERE id=$1 AND project_id=$2",
          [id, ctx.projectId],
        )
      ).rows[0];
      if (!r || r.kind !== expected)
        throw new AppError(
          422,
          "invalid_reference",
          `The ${field} reference is unavailable or has the wrong kind.`,
        );
    }
  }
  for (const field of ["fileId", "imageFileId"])
    if (
      typeof validated[field] === "string" &&
      !dryFiles?.has(validated[field] as string)
    ) {
      if (
        !(
          await ctx.db.query(
            "SELECT id FROM files WHERE id=$1 AND project_id=$2",
            [validated[field], ctx.projectId],
          )
        ).rowCount
      )
        throw new AppError(422, "invalid_file", "The file is unavailable.");
    }
  if (
    validated.assigneeId &&
    !(
      await ctx.db.query(
        "SELECT user_id FROM memberships WHERE user_id=$1 AND project_id=$2 AND revoked_at IS NULL",
        [validated.assigneeId, ctx.projectId],
      )
    ).rowCount
  )
    throw new AppError(
      422,
      "invalid_assignee",
      "Assignee must be a project member.",
    );
  return validated;
}
export async function appendObjectRevision(
  ctx: Context,
  row: ObjectRow,
  summary: string,
  dryFiles?: Set<string>,
) {
  const snapshot = objectDto(row);
  await ctx.db.query(
    "INSERT INTO object_revisions(id,project_id,object_id,version,actor_id,actor_name,source,summary,visibility,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      randomUUID(),
      ctx.projectId,
      row.id,
      row.version,
      ctx.principal.id,
      ctx.principal.name,
      ctx.principal.type === "agent" ? "agent" : "web",
      summary,
      row.visibility,
      JSON.stringify(snapshot),
    ],
  );
  for (const fileId of [row.data.fileId, row.data.imageFileId].filter(
    (v): v is string => typeof v === "string",
  )) {
    if (dryFiles?.has(fileId)) continue;
    await ctx.db.query(
      "INSERT INTO object_files(project_id,object_id,revision,file_id,visibility) VALUES($1,$2,$3,$4,$5)",
      [ctx.projectId, row.id, row.version, fileId, row.visibility],
    );
  }
  await audit(ctx, "object.revision", summary, row.id, row.visibility, {
    version: row.version,
    kind: row.kind,
    status: row.status,
    archived: row.archived,
  });
}
export async function createObject(
  ctx: Context,
  draft: ObjectDraft,
  options: {
    id?: string;
    pending?: Map<string, ObjectKind>;
    dryFiles?: Set<string>;
    archived?: boolean;
  } = {},
) {
  if (ctx.role === "customer" && draft.kind !== "proposal") throw forbidden();
  if (
    ctx.principal.type === "agent" &&
    (draft.kind === "rule" || draft.status === "done")
  )
    throw forbidden();
  if (draft.kind === "rule" && draft.visibility !== "team")
    throw new AppError(
      422,
      "rule_visibility",
      "Rules are internal project documents.",
    );
  if (
    ctx.role === "customer" &&
    (draft.visibility !== "customer" ||
      draft.status !== "backlog" ||
      draft.data.linkedStoryId ||
      draft.data.decision)
  )
    throw forbidden();
  if (draft.kind === "rule") await lockProjectRules(ctx);
  const data = await validateData(
    ctx,
    draft.kind,
    draft.data,
    options.pending,
    options.dryFiles,
  );
  const row = (
    await ctx.db.query(
      "INSERT INTO objects(id,project_id,key,kind,title,description,tags,visibility,status,data,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
      [
        options.id ?? randomUUID(),
        ctx.projectId,
        draft.key,
        draft.kind,
        draft.title,
        draft.description,
        draft.tags,
        draft.visibility,
        draft.status,
        JSON.stringify(data),
        options.archived ?? false,
      ],
    )
  ).rows[0] as ObjectRow;
  await appendObjectRevision(
    ctx,
    row,
    "Created " + draft.kind,
    options.dryFiles,
  );
  return readableReferences(ctx, objectDto(row));
}
export async function patchObject(
  ctx: Context,
  id: string,
  patch: ObjectPatch,
  options: { pending?: Map<string, ObjectKind>; dryFiles?: Set<string> } = {},
) {
  canEdit(ctx);
  const old = await readObjectRow(ctx, id, true);
  if (old.version !== patch.expectedVersion) throw conflict();
  if (
    ctx.principal.type === "agent" &&
    (old.kind === "rule" || patch.status === "done")
  )
    throw forbidden();
  if (old.kind === "rule" && patch.visibility === "customer")
    throw new AppError(
      422,
      "rule_visibility",
      "Rules are internal project documents.",
    );
  if (old.kind === "rule") await lockProjectRules(ctx);
  const data = patch.data
    ? await validateData(
        ctx,
        old.kind,
        patch.data,
        options.pending,
        options.dryFiles,
      )
    : old.data;
  if (old.kind === "proposal" && data.linkedStoryId !== old.data.linkedStoryId)
    throw new AppError(
      422,
      "conversion_required",
      "Use the proposal conversion operation to create a linked story.",
    );
  const row = (
    await ctx.db.query(
      "UPDATE objects SET title=$3,description=$4,tags=$5,visibility=$6,status=$7,archived=$8,data=$9,version=version+1,updated_at=now() WHERE id=$1 AND project_id=$2 RETURNING *",
      [
        id,
        ctx.projectId,
        patch.title ?? old.title,
        patch.description ?? old.description,
        patch.tags ?? old.tags,
        patch.visibility ?? old.visibility,
        patch.status ?? old.status,
        patch.archived ?? old.archived,
        JSON.stringify(data),
      ],
    )
  ).rows[0] as ObjectRow;
  await appendObjectRevision(ctx, row, "Updated " + old.kind, options.dryFiles);
  return readableReferences(ctx, objectDto(row));
}
export async function listObjects(
  ctx: Context,
  q: z.infer<typeof listQuerySchema>,
) {
  const rows = (
    await ctx.db.query(
      "SELECT * FROM objects WHERE project_id=$1 AND ($2=false OR (visibility='customer' AND kind<>'rule')) AND ($3::text IS NULL OR kind=$3) AND ($4::text IS NULL OR status=$4) AND ($5='all' OR archived=($5='true')) AND ($6::text IS NULL OR $6=ANY(tags)) AND ($7::text IS NULL OR replace(lower(key||' '||title||' '||description||' '||array_to_string(tags,' ')),'ё','е') LIKE '%'||replace(lower($7),'ё','е')||'%') AND (id>$8::uuid OR $8 IS NULL) ORDER BY id LIMIT $9",
      [
        ctx.projectId,
        isCustomer(ctx),
        q.kind ?? null,
        q.status ?? null,
        q.archived,
        q.tag ?? null,
        q.q ?? null,
        decodeCursor(q.cursor),
        q.limit + 1,
      ],
    )
  ).rows as ObjectRow[];
  const result = page(rows, q.limit);
  return {
    ...result,
    items: await Promise.all(
      result.items.map((row) => readableReferences(ctx, objectDto(row))),
    ),
  };
}
export async function objectHistory(
  ctx: Context,
  id: string,
  limit: number,
  cursor?: string,
) {
  await readObjectRow(ctx, id);
  const rows = (
    await ctx.db.query(
      'SELECT id,version,actor_name AS "actorName",source,summary,created_at AS "createdAt",snapshot FROM object_revisions WHERE project_id=$1 AND object_id=$2 AND ($3=false OR visibility=\'customer\') AND (id>$4::uuid OR $4 IS NULL) ORDER BY id LIMIT $5',
      [ctx.projectId, id, isCustomer(ctx), decodeCursor(cursor), limit + 1],
    )
  ).rows;
  const result = page(rows, limit);
  return {
    ...result,
    items: await Promise.all(
      result.items.map(async (r) => ({
        ...r,
        snapshot: await readableReferences(ctx, r.snapshot),
      })),
    ),
  };
}
export async function restoreObject(
  ctx: Context,
  id: string,
  input: { expectedVersion: number; revisionVersion: number; reason: string },
) {
  canEdit(ctx);
  const current = await readObjectRow(ctx, id, true);
  if (current.version !== input.expectedVersion) throw conflict();
  if (current.kind === "rule") human(ctx);
  const revision = (
    await ctx.db.query(
      "SELECT snapshot,visibility FROM object_revisions WHERE project_id=$1 AND object_id=$2 AND version=$3",
      [ctx.projectId, id, input.revisionVersion],
    )
  ).rows[0];
  if (!revision) throw missing();
  if (revision.visibility === "team" && current.visibility === "customer")
    throw conflict(
      "Restore private content only after explicitly changing the current visibility to team.",
    );
  const snapshot = revision.snapshot as ProjectObject;
  const data = { ...snapshot.data };
  if (current.kind === "proposal") {
    if (current.data.linkedStoryId)
      data.linkedStoryId = current.data.linkedStoryId;
    else delete data.linkedStoryId;
    data.decision = current.data.decision;
    if (data.decision === undefined) delete data.decision;
  }
  const result = await patchObject(ctx, id, {
    expectedVersion: input.expectedVersion,
    title: snapshot.title,
    description: snapshot.description,
    tags: snapshot.tags,
    data,
  });
  await audit(ctx, "object.restore", input.reason, id, current.visibility, {
    restoredVersion: input.revisionVersion,
    newVersion: result.version,
  });
  return result;
}
export async function convertProposal(
  ctx: Context,
  id: string,
  expectedVersion: number,
) {
  canEdit(ctx);
  human(ctx);
  const p = await readObjectRow(ctx, id, true);
  if (p.kind !== "proposal")
    throw new AppError(422, "wrong_kind", "Only proposals can be converted.");
  if (p.data.linkedStoryId) return getObject(ctx, String(p.data.linkedStoryId));
  if (p.version !== expectedVersion) throw conflict();
  const story = await createObject(ctx, {
    key: `proposal-${p.id}`,
    kind: "story",
    title: p.title,
    description: p.description,
    tags: p.tags,
    visibility: p.visibility,
    status: "backlog",
    data: {},
  });
  const data = { ...p.data, linkedStoryId: story.id, decision: "accepted" };
  const row = (
    await ctx.db.query(
      "UPDATE objects SET data=$3,status='done',version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",
      [ctx.projectId, id, JSON.stringify(data)],
    )
  ).rows[0] as ObjectRow;
  await appendObjectRevision(ctx, row, "Converted proposal to story");
  return story;
}
