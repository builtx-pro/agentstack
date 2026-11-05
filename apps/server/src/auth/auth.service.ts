import type { FastifyRequest } from "fastify";
import type { Database, Principal } from "../db/database.service.js";
import {
  hashToken,
  newSecret,
  verifyPassword,
  hashPassword,
} from "../shared/crypto.util.js";
import { AppError, forbidden, missing } from "../shared/errors.js";
import { randomUUID } from "node:crypto";
import type { User } from "@agentstack/contracts";
import { appendUserAudit, safeUserSnapshot } from "./user-audit.service.js";
export const publicUser = (r: Record<string, unknown>): User => ({
  id: String(r.id),
  email: String(r.email),
  name: String(r.name),
  isAdmin: Boolean(r.is_admin),
  disabled: Boolean(r.disabled),
  version: Number(r.version),
});
export async function authenticate(
  database: Database,
  request: FastifyRequest,
): Promise<Principal> {
  const authorization = request.headers.authorization;
  if (authorization) {
    if (!authorization.startsWith("Bearer "))
      throw new AppError(401, "unauthorized", "Sign in to continue.");
    const hash = hashToken(authorization.slice(7));
    return database.transaction(null, async (db) => {
      await db.query("SELECT set_config('agentstack.token_hash',$1,true)", [
        hash,
      ]);
      const row = (
        await db.query(
          "SELECT t.id AS token_id,t.name AS token_name,t.project_id,t.scopes,u.* FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now() AND NOT u.disabled",
          [hash],
        )
      ).rows[0];
      if (!row)
        throw new AppError(
          401,
          "unauthorized",
          "The access token is invalid or expired.",
        );
      return {
        id: row.id,
        name: `${row.token_name} (agent)`,
        email: row.email,
        isAdmin: row.is_admin,
        version: row.version,
        type: "agent",
        key: `token:${row.token_id}`,
        tokenId: row.token_id,
        projectId: row.project_id,
        scopes: row.scopes,
      };
    });
  }
  const cookie = request.cookies["agentstack_session"];
  if (!cookie) throw new AppError(401, "unauthorized", "Sign in to continue.");
  const row = (
    await database.pool.query(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now() AND NOT u.disabled",
      [hashToken(cookie)],
    )
  ).rows[0];
  if (!row)
    throw new AppError(
      401,
      "unauthorized",
      "Your session expired. Sign in again.",
    );
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isAdmin: row.is_admin,
    version: row.version,
    type: "human",
    key: `user:${row.id}`,
    scopes: ["read", "write", "review"],
  };
}
export async function login(
  database: Database,
  email: string,
  password: string,
) {
  const row = (
    await database.pool.query(
      "SELECT * FROM users WHERE email=$1 AND NOT disabled",
      [email],
    )
  ).rows[0];
  const valid = await verifyPassword(
    password,
    row?.password_hash ??
      "scrypt:00000000000000000000000000000000:" + "00".repeat(64),
  );
  if (!row || !valid)
    throw new AppError(
      401,
      "invalid_credentials",
      "Email or password is incorrect.",
    );
  const secret = newSecret();
  await database.pool.query(
    "INSERT INTO sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [hashToken(secret), row.id],
  );
  return { user: publicUser(row), secret };
}
export async function createUser(
  database: Database,
  principal: Principal,
  input: { email: string; name: string; password: string; isAdmin: boolean },
) {
  if (!principal.isAdmin || principal.type !== "human") throw forbidden();
  return database.transaction(principal, async (db) => {
    const row = (
      await db.query(
        "INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [
          randomUUID(),
          input.email,
          input.name,
          await hashPassword(input.password),
          input.isAdmin,
        ],
      )
    ).rows[0];
    await appendUserAudit(
      db,
      principal,
      "web",
      "user.create",
      null,
      safeUserSnapshot(row),
      ["created"],
    );
    return publicUser(row);
  });
}
export async function acceptInvitation(
  database: Database,
  input: { token: string; name: string; password: string },
) {
  return database.transaction(null, async (db) => {
    await db.query("SELECT set_config('agentstack.invitation_hash',$1,true)", [
      hashToken(input.token),
    ]);
    const invitation = (
      await db.query(
        "SELECT * FROM invitations WHERE hash=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
        [hashToken(input.token)],
      )
    ).rows[0];
    if (!invitation) throw missing();
    if (
      (await db.query("SELECT 1 FROM users WHERE email=$1", [invitation.email]))
        .rowCount
    )
      throw new AppError(
        409,
        "account_exists",
        "An account already exists. Ask an administrator to add its membership.",
      );
    const userId = randomUUID();
    await db.query(
      "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
      [
        userId,
        invitation.email,
        input.name,
        await hashPassword(input.password),
      ],
    );
    await db.query("SELECT set_config('agentstack.project_id',$1,true)", [
      invitation.project_id,
    ]);
    await db.query(
      "INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3)",
      [invitation.project_id, userId, invitation.role],
    );
    await db.query("SELECT set_config('agentstack.user_id',$1,true)", [userId]);
    const invited = (
      await db.query("SELECT * FROM users WHERE id=$1", [userId])
    ).rows[0];
    await appendUserAudit(
      db,
      { id: userId, name: input.name },
      "invitation",
      "user.invited",
      null,
      safeUserSnapshot(invited),
      ["created"],
    );
    await db.query("UPDATE invitations SET accepted_at=now() WHERE id=$1", [
      invitation.id,
    ]);
    await db.query(
      "INSERT INTO audit_events(id,project_id,actor_id,actor_name,source,action,summary) VALUES($1,$2,$3,$4,'web','membership.accept','Invitation accepted')",
      [randomUUID(), invitation.project_id, userId, input.name],
    );
    return {
      user: {
        id: userId,
        email: invitation.email,
        name: input.name,
        isAdmin: false,
        version: 1,
        disabled: false,
      },
    };
  });
}
