import { randomUUID } from "node:crypto";
import type { Database, Principal, Context } from "../db/database.service.js";
import { admin, canEdit, human } from "../db/database.service.js";
import type { Project, TokenScope } from "@agentstack/contracts";
import { conflict, forbidden, missing } from "../shared/errors.js";
import { audit } from "../shared/audit.service.js";
import { hashToken, newSecret } from "../shared/crypto.util.js";
import { decodeCursor, page } from "../shared/pagination.util.js";
export const projectDto = (r: Record<string, unknown>): Project => ({
  id: String(r.id),
  name: String(r.name),
  slug: String(r.slug),
  description: String(r.description),
  version: Number(r.version),
  archived: Boolean(r.archived),
  createdAt: new Date(String(r.created_at)).toISOString(),
  updatedAt: new Date(String(r.updated_at)).toISOString(),
  ...(r.role ? { role: r.role as Project["role"] } : {}),
});
export async function listProjects(
  db: Database,
  p: Principal,
  limit: number,
  cursor?: string,
) {
  return db.transaction(p, async (client) => {
    if (p.type === "agent") {
      await client.query("SELECT set_config('agentstack.is_admin',$1,true)", [
        p.isAdmin ? "true" : "false",
      ]);
    }
    const r = await client.query(
      "SELECT p.*,CASE WHEN $1 THEN 'admin' ELSE m.role END AS role FROM projects p LEFT JOIN memberships m ON m.project_id=p.id AND m.user_id=$2 AND m.revoked_at IS NULL WHERE (p.id>$3::uuid OR $3 IS NULL) AND ($4::uuid IS NULL OR p.id=$4) AND ($1 OR m.user_id IS NOT NULL) ORDER BY p.id LIMIT $5",
      [
        p.isAdmin,
        p.id,
        decodeCursor(cursor),
        p.type === "agent" ? p.projectId : null,
        limit + 1,
      ],
    );
    return page(r.rows.map(projectDto), limit);
  });
}
export async function createProject(
  database: Database,
  p: Principal,
  input: { name: string; slug: string; description: string },
) {
  if (!p.isAdmin || p.type !== "human") throw forbidden();
  return database.transaction(p, async (db) => {
    const id = randomUUID();
    const row = (
      await db.query(
        "INSERT INTO projects(id,name,slug,description) VALUES($1,$2,$3,$4) RETURNING *",
        [id, input.name, input.slug, input.description],
      )
    ).rows[0];
    await db.query("SELECT set_config('agentstack.project_id',$1,true)", [id]);
    const ctx = { db, principal: p, projectId: id, role: "admin" as const };
    const result = projectDto({ ...row, role: "admin" });
    await projectRevision(ctx, result);
    await audit(ctx, "project.create", "Project created");
    return result;
  });
}
export async function getProject(ctx: Context) {
  const row = (
    await ctx.db.query("SELECT * FROM projects WHERE id=$1", [ctx.projectId])
  ).rows[0];
  if (!row) throw missing();
  return projectDto({ ...row, role: ctx.role });
}
async function projectRevision(ctx: Context, snapshot: Project) {
  await ctx.db.query(
    "INSERT INTO project_revisions(id,project_id,version,actor_id,actor_name,source,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      randomUUID(),
      ctx.projectId,
      snapshot.version,
      ctx.principal.id,
      ctx.principal.name,
      "web",
      JSON.stringify(snapshot),
    ],
  );
}
export async function patchProject(
  ctx: Context,
  input: {
    expectedVersion: number;
    name?: string;
    description?: string;
    archived?: boolean;
  },
) {
  admin(ctx);
  const old = (
    await ctx.db.query("SELECT * FROM projects WHERE id=$1 FOR UPDATE", [
      ctx.projectId,
    ])
  ).rows[0];
  if (old.version !== input.expectedVersion) throw conflict();
  const row = (
    await ctx.db.query(
      "UPDATE projects SET name=$2,description=$3,archived=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
      [
        ctx.projectId,
        input.name ?? old.name,
        input.description ?? old.description,
        input.archived ?? old.archived,
      ],
    )
  ).rows[0];
  const result = projectDto({ ...row, role: ctx.role });
  await projectRevision(ctx, result);
  await audit(ctx, "project.update", "Project settings updated");
  return result;
}
export async function projectHistory(
  ctx: Context,
  limit: number,
  cursor?: string,
) {
  admin(ctx);
  const rows = (
    await ctx.db.query(
      'SELECT id,version,actor_name AS "actorName",source,created_at AS "createdAt",snapshot FROM project_revisions WHERE project_id=$1 AND (id>$2::uuid OR $2 IS NULL) ORDER BY id LIMIT $3',
      [ctx.projectId, decodeCursor(cursor), limit + 1],
    )
  ).rows;
  return page(rows, limit);
}
export async function listMembers(ctx: Context, includeRevoked = false) {
  admin(ctx);
  const items = (
    await ctx.db.query(
      'SELECT u.id AS "userId",u.name,u.email,m.role,m.version,m.revoked_at AS "revokedAt" FROM memberships m JOIN users u ON u.id=m.user_id WHERE project_id=$1 AND ($2 OR m.revoked_at IS NULL) ORDER BY u.name',
      [ctx.projectId, includeRevoked],
    )
  ).rows;
  return { items, nextCursor: null };
}
export async function setMember(
  ctx: Context,
  userId: string,
  role: string,
  expectedVersion: number,
) {
  admin(ctx);
  const user = (
    await ctx.db.query("SELECT id FROM users WHERE id=$1 AND NOT disabled", [
      userId,
    ])
  ).rows[0];
  if (!user) throw missing();
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `membership:${ctx.projectId}:${userId}`,
  ]);
  const old = (
    await ctx.db.query(
      "SELECT * FROM memberships WHERE project_id=$1 AND user_id=$2 FOR UPDATE",
      [ctx.projectId, userId],
    )
  ).rows[0];
  if ((old?.version ?? 0) !== expectedVersion) throw conflict();
  const result = (
    await ctx.db.query(
      'INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role,version=memberships.version+1,revoked_at=NULL RETURNING user_id AS "userId",role,version,revoked_at AS "revokedAt"',
      [ctx.projectId, userId, role],
    )
  ).rows[0];
  await audit(
    ctx,
    "membership.set",
    "Project membership updated",
    null,
    "team",
    {
      userId,
      role,
      previousRole: old?.role ?? null,
      wasRevoked: Boolean(old?.revoked_at),
      version: result.version,
    },
  );
  return result;
}
export async function removeMember(
  ctx: Context,
  userId: string,
  expectedVersion: number,
) {
  admin(ctx);
  const old = (
    await ctx.db.query(
      "SELECT * FROM memberships WHERE project_id=$1 AND user_id=$2 FOR UPDATE",
      [ctx.projectId, userId],
    )
  ).rows[0];
  if (!old || old.revoked_at) throw missing();
  if (old.version !== expectedVersion) throw conflict();
  await ctx.db.query(
    "UPDATE memberships SET revoked_at=now(),version=version+1 WHERE project_id=$1 AND user_id=$2",
    [ctx.projectId, userId],
  );
  await ctx.db.query(
    "UPDATE tokens SET revoked_at=now() WHERE project_id=$1 AND user_id=$2 AND revoked_at IS NULL",
    [ctx.projectId, userId],
  );
  await audit(
    ctx,
    "membership.remove",
    "Project membership revoked",
    null,
    "team",
    { userId, previousRole: old.role, version: old.version + 1 },
  );
  return { ok: true, version: old.version + 1 };
}
export async function createToken(
  ctx: Context,
  input: { name: string; scopes: TokenScope[]; expiresInDays: number },
) {
  canEdit(ctx);
  human(ctx);
  const token = `as_${newSecret()}`;
  const id = randomUUID();
  const row = (
    await ctx.db.query(
      'INSERT INTO tokens(id,project_id,user_id,hash,name,scopes,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+($7::text||\' days\')::interval) RETURNING id,name,scopes,expires_at AS "expiresAt",created_at AS "createdAt"',
      [
        id,
        ctx.projectId,
        ctx.principal.id,
        hashToken(token),
        input.name,
        input.scopes,
        input.expiresInDays,
      ],
    )
  ).rows[0];
  await audit(ctx, "token.create", "Agent access token created", null, "team", {
    id,
    name: input.name,
    scopes: input.scopes,
  });
  return { ...row, token };
}
export async function listTokens(ctx: Context) {
  canEdit(ctx);
  human(ctx);
  return {
    items: (
      await ctx.db.query(
        'SELECT id,name,scopes,expires_at AS "expiresAt",revoked_at AS "revokedAt",created_at AS "createdAt" FROM tokens WHERE project_id=$1 AND (user_id=$2 OR $3) ORDER BY created_at DESC',
        [ctx.projectId, ctx.principal.id, ctx.principal.isAdmin],
      )
    ).rows,
    nextCursor: null,
  };
}
export async function revokeToken(ctx: Context, id: string) {
  canEdit(ctx);
  human(ctx);
  const row = (
    await ctx.db.query(
      "UPDATE tokens SET revoked_at=now() WHERE id=$1 AND project_id=$2 AND (user_id=$3 OR $4) RETURNING id",
      [id, ctx.projectId, ctx.principal.id, ctx.principal.isAdmin],
    )
  ).rows[0];
  if (!row) throw missing();
  await audit(ctx, "token.revoke", "Agent access token revoked", null, "team", {
    id,
  });
  return { ok: true };
}
export async function createInvitation(
  ctx: Context,
  input: { email: string; role: string; expiresInHours: number },
) {
  admin(ctx);
  const token = newSecret(),
    id = randomUUID();
  const row = (
    await ctx.db.query(
      "INSERT INTO invitations(id,project_id,email,role,hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+($6::text||' hours')::interval) RETURNING id,email,role,expires_at AS \"expiresAt\"",
      [
        id,
        ctx.projectId,
        input.email,
        input.role,
        hashToken(token),
        input.expiresInHours,
      ],
    )
  ).rows[0];
  await audit(
    ctx,
    "invitation.create",
    "Project invitation created",
    null,
    "team",
    { id, email: input.email, role: input.role },
  );
  return { ...row, token };
}
export async function revokeInvitation(ctx: Context, id: string) {
  admin(ctx);
  const row = (
    await ctx.db.query(
      "UPDATE invitations SET revoked_at=now() WHERE project_id=$1 AND id=$2 AND accepted_at IS NULL RETURNING id",
      [ctx.projectId, id],
    )
  ).rows[0];
  if (!row) throw missing();
  await audit(ctx, "invitation.revoke", "Invitation revoked", null, "team", {
    id,
  });
  return { ok: true };
}
