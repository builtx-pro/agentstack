import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Database, Principal } from "../db/database.service.js";
import { conflict, forbidden, missing, AppError } from "../shared/errors.js";
import { hashPassword } from "../shared/crypto.util.js";
import { decodeCursor, page } from "../shared/pagination.util.js";

export interface SafeUserSnapshot {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  disabled: boolean;
  version: number;
}
export function safeUserSnapshot(
  row: Record<string, unknown>,
): SafeUserSnapshot {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    isAdmin: Boolean(row.is_admin),
    disabled: Boolean(row.disabled),
    version: Number(row.version),
  };
}
export async function appendUserAudit(
  db: PoolClient,
  actor: { id: string | null; name: string },
  source: "web" | "bootstrap" | "invitation" | "migration",
  action: string,
  before: SafeUserSnapshot | null,
  after: SafeUserSnapshot,
  changes: string[],
) {
  await db.query(
    "INSERT INTO installation_admin_audit(id,actor_id,actor_name,source,action,target_id,target_version,before_snapshot,after_snapshot,changes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      randomUUID(),
      actor.id,
      actor.name,
      source,
      action,
      after.id,
      after.version,
      before ? JSON.stringify(before) : null,
      JSON.stringify(after),
      changes,
    ],
  );
}
export async function updateUser(
  database: Database,
  principal: Principal,
  id: string,
  input: {
    expectedVersion: number;
    name?: string;
    password?: string;
    disabled?: boolean;
  },
) {
  if (!principal.isAdmin || principal.type !== "human") throw forbidden();
  if (id === principal.id && input.disabled)
    throw new AppError(
      422,
      "self_disable",
      "Administrators cannot disable their own active account.",
    );
  return database.transaction(principal, async (db) => {
    const old = (
      await db.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!old) throw missing();
    if (old.version !== input.expectedVersion) throw conflict();
    const changes: string[] = [];
    if (input.name !== undefined && input.name !== old.name)
      changes.push("name");
    if (input.password) changes.push("password_changed");
    if (input.disabled !== undefined && input.disabled !== old.disabled)
      changes.push(input.disabled ? "disabled" : "enabled");
    if (!changes.length) return safeUserSnapshot(old);
    const row = (
      await db.query(
        "UPDATE users SET name=$2,password_hash=$3,disabled=$4,version=version+1 WHERE id=$1 RETURNING *",
        [
          id,
          input.name ?? old.name,
          input.password
            ? await hashPassword(input.password)
            : old.password_hash,
          input.disabled ?? old.disabled,
        ],
      )
    ).rows[0];
    if (input.password || input.disabled)
      await db.query("DELETE FROM sessions WHERE user_id=$1", [id]);
    const snapshot = safeUserSnapshot(row);
    await appendUserAudit(
      db,
      principal,
      "web",
      "user.update",
      safeUserSnapshot(old),
      snapshot,
      changes,
    );
    return snapshot;
  });
}
export async function userAudit(
  database: Database,
  principal: Principal,
  limit: number,
  cursor?: string,
  targetId?: string,
) {
  if (!principal.isAdmin || principal.type !== "human") throw forbidden();
  return database.transaction(principal, async (db) => {
    if (
      targetId &&
      !(await db.query("SELECT id FROM users WHERE id=$1", [targetId])).rowCount
    )
      throw missing();
    const rows = (
      await db.query(
        'SELECT id,actor_name AS "actorName",source,action,target_id AS "targetId",target_version AS version,before_snapshot AS before,after_snapshot AS after,changes,created_at AS "createdAt" FROM installation_admin_audit WHERE ($1::uuid IS NULL OR target_id=$1) AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM installation_admin_audit WHERE id=$2)) ORDER BY created_at DESC,id DESC LIMIT $3',
        [targetId ?? null, decodeCursor(cursor), limit + 1],
      )
    ).rows;
    return page(rows, limit);
  });
}
