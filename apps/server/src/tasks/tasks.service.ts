import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import type {
  PersonalTaskDraft,
  PersonalTaskPatch,
  TaskItem,
  TaskListQuery,
} from "@agentstack/contracts";
import type { Database, Principal } from "../db/database.service.js";
import { AppError, conflict, forbidden, missing } from "../shared/errors.js";
type Row = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  status: TaskItem["status"];
  priority: TaskItem["priority"];
  blocked: boolean;
  checklist: TaskItem["checklist"];
  tags: string[];
  archived: boolean;
  version: number;
  creation_hash: string;
  created_at: Date;
  updated_at: Date;
};
export const taskHuman = (principal: Principal) => {
  if (principal.type !== "human") throw forbidden();
  return principal;
};
function dto(row: Row): TaskItem {
  return {
    id: row.id,
    source: "personal",
    projectId: null,
    projectName: null,
    canEdit: true,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    blocked: row.blocked,
    checklist: row.checklist,
    tags: row.tags,
    archived: row.archived,
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
async function getRow(
  db: PoolClient,
  owner: string,
  id: string,
  lock = false,
): Promise<Row> {
  const row = (
    await db.query(
      `SELECT * FROM personal_tasks WHERE owner_id=$1 AND id=$2 ${lock ? "FOR UPDATE" : ""}`,
      [owner, id],
    )
  ).rows[0];
  if (!row) throw missing();
  return row;
}
async function history(db: PoolClient, row: Row, action: string) {
  await db.query(
    "INSERT INTO personal_task_history(id,owner_id,task_id,version,action,snapshot) VALUES($1,$2,$3,$4,$5,$6)",
    [
      randomUUID(),
      row.owner_id,
      row.id,
      row.version,
      action,
      JSON.stringify(dto(row)),
    ],
  );
}
export async function createTask(
  database: Database,
  principal: Principal,
  input: PersonalTaskDraft,
) {
  taskHuman(principal);
  return database.transaction(principal, async (db) => {
    const hash = createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex");
    const inserted = (
      await db.query(
        "INSERT INTO personal_tasks(owner_id,id,title,description,status,priority,blocked,checklist,tags,creation_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(owner_id,id) DO NOTHING RETURNING *",
        [
          principal.id,
          input.id,
          input.title,
          input.description,
          input.status,
          input.priority,
          input.blocked,
          JSON.stringify(input.checklist),
          input.tags,
          hash,
        ],
      )
    ).rows[0] as Row | undefined;
    if (inserted) {
      await history(db, inserted, "task.created");
      return { task: dto(inserted), created: true };
    }
    const existing = await getRow(db, principal.id, input.id);
    if (existing.creation_hash !== hash)
      throw conflict("This task ID was already used for another submission.");
    return { task: dto(existing), created: false };
  });
}
export async function getTask(
  database: Database,
  principal: Principal,
  id: string,
) {
  taskHuman(principal);
  return database.transaction(principal, async (db) =>
    dto(await getRow(db, principal.id, id)),
  );
}
export async function patchTask(
  database: Database,
  principal: Principal,
  id: string,
  input: PersonalTaskPatch,
) {
  taskHuman(principal);
  return database.transaction(principal, async (db) => {
    const old = await getRow(db, principal.id, id, true);
    if (old.version !== input.expectedVersion) throw conflict();
    const row = (
      await db.query(
        "UPDATE personal_tasks SET title=$3,description=$4,status=$5,priority=$6,blocked=$7,checklist=$8,tags=$9,archived=$10,version=version+1,updated_at=now() WHERE owner_id=$1 AND id=$2 RETURNING *",
        [
          principal.id,
          id,
          input.title ?? old.title,
          input.description ?? old.description,
          input.status ?? old.status,
          input.priority ?? old.priority,
          input.blocked ?? old.blocked,
          JSON.stringify(input.checklist ?? old.checklist),
          input.tags ?? old.tags,
          input.archived ?? old.archived,
        ],
      )
    ).rows[0] as Row;
    await history(
      db,
      row,
      input.archived !== undefined && input.archived !== old.archived
        ? input.archived
          ? "task.archived"
          : "task.restored"
        : input.status !== undefined && input.status !== old.status
          ? "task.moved"
          : "task.updated",
    );
    return dto(row);
  });
}
const cursorSchema = z.tuple([z.enum(["personal", "project"]), z.uuid()]);
function cursor(value?: string): [string | null, string | null] {
  if (!value) return [null, null];
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new AppError(400, "invalid_cursor", "Invalid pagination cursor.");
  }
}
export async function listTasks(
  database: Database,
  principal: Principal,
  q: TaskListQuery,
) {
  taskHuman(principal);
  const [source, id] = cursor(q.cursor);
  return database.transaction(principal, async (db) => {
    await db.query(
      "SELECT set_config('agentstack.personal_board','true',true)",
    );
    const rows = (
      await db.query(
        `WITH items AS (
SELECT 'personal'::text AS source,t.id,NULL::uuid AS "projectId",NULL::text AS "projectName",true AS "canEdit",t.title,t.description,t.status,t.priority,t.blocked,t.checklist,t.tags,t.archived,t.version,t.created_at AS "createdAt",t.updated_at AS "updatedAt"
FROM personal_tasks t WHERE t.owner_id=$1 AND $2<>'assigned'
UNION ALL
SELECT 'project'::text,o.id,o.project_id,p.name,(current_setting('agentstack.is_admin',true)='true' OR EXISTS(SELECT 1 FROM memberships m WHERE m.project_id=o.project_id AND m.user_id=$1 AND m.revoked_at IS NULL AND m.role='developer')),o.title,o.description,o.status,coalesce(o.data->>'priority','normal'),coalesce((o.data->>'blocked')::boolean,false),coalesce(o.data->'checklist','[]'::jsonb),o.tags,o.archived,o.version,o.created_at,o.updated_at
FROM objects o JOIN projects p ON p.id=o.project_id WHERE $2<>'personal' AND o.kind='story' AND o.data->>'assigneeId'=$1::text AND NOT p.archived
AND (current_setting('agentstack.is_admin',true)='true' OR EXISTS(SELECT 1 FROM memberships m WHERE m.project_id=o.project_id AND m.user_id=$1 AND m.revoked_at IS NULL AND (m.role='developer' OR o.visibility='customer')))
) SELECT * FROM items WHERE ($3::text IS NULL OR status=$3) AND ($4='all' OR archived=($4='true'))
AND ($5::text IS NULL OR strpos(replace(lower(title||' '||description||' '||array_to_string(tags,' ')),'ё','е'),replace(lower($5),'ё','е'))>0)
AND ($6::text IS NULL OR (source,id)>($6,$7::uuid)) ORDER BY source,id LIMIT $8`,
        [
          principal.id,
          q.source,
          q.status ?? null,
          q.archived,
          q.q ?? null,
          source,
          id,
          q.limit + 1,
        ],
      )
    ).rows;
    const items = rows
      .slice(0, q.limit)
      .map((row) => ({
        ...row,
        createdAt: new Date(row.createdAt).toISOString(),
        updatedAt: new Date(row.updatedAt).toISOString(),
      })) as TaskItem[];
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > q.limit && last
          ? Buffer.from(JSON.stringify([last.source, last.id])).toString(
              "base64url",
            )
          : null,
    };
  });
}
export async function taskHistory(
  database: Database,
  principal: Principal,
  id: string,
  limit: number,
  before?: string,
) {
  taskHuman(principal);
  return database.transaction(principal, async (db) => {
    await getRow(db, principal.id, id);
    const rows = (
      await db.query(
        'SELECT id,version,action,snapshot,created_at AS "createdAt" FROM personal_task_history WHERE owner_id=$1 AND task_id=$2 AND ($3::bigint IS NULL OR version<$3) ORDER BY version DESC LIMIT $4',
        [principal.id, id, before ?? null, limit + 1],
      )
    ).rows;
    return {
      items: rows
        .slice(0, limit)
        .map((row) => ({
          ...row,
          createdAt: new Date(row.createdAt).toISOString(),
        })),
      nextCursor: rows.length > limit ? String(rows[limit - 1].version) : null,
    };
  });
}
