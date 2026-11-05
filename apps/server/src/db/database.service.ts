import { Pool, type PoolClient } from "pg";
import type { Role, TokenScope } from "@agentstack/contracts";
import { forbidden, missing } from "../shared/errors.js";
export interface Principal {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  version?: number;
  type: "human" | "agent";
  key: string;
  tokenId?: string;
  projectId?: string;
  scopes: TokenScope[];
}
export interface Context {
  db: PoolClient;
  principal: Principal;
  projectId: string;
  role: Role;
}
export class Database {
  readonly pool: Pool;
  constructor(url: string, onPoolError: (event: {event: 'database_pool_error'; code: string}) => void = () => {}) {
    this.pool = new Pool({
      connectionString: url,
      max: 12,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000,
    });
    this.pool.on('error', (error: Error & {code?: string}) => {
      const code = typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : 'unknown';
      onPoolError({event: 'database_pool_error', code});
    });
  }
  async transaction<T>(
    principal: Principal | null,
    fn: (db: PoolClient) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "SELECT set_config('agentstack.user_id',$1,true),set_config('agentstack.is_admin',$2,true)",
        [
          principal?.id ?? "",
          principal?.isAdmin && principal.type === "human" ? "true" : "false",
        ],
      );
      const result = await fn(db);
      await db.query("COMMIT");
      return result;
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async project<T>(
    principal: Principal,
    projectId: string,
    scope: TokenScope,
    fn: (ctx: Context) => Promise<T>,
  ) {
    return this.transaction(principal, async (db) => {
      if (
        principal.type === "agent" &&
        (principal.projectId !== projectId || !principal.scopes.includes(scope))
      )
        throw principal.projectId !== projectId ? missing() : forbidden();
      // An administrator's token must still have a membership or a currently administrative owner.
      const user = (
        await db.query("SELECT is_admin,disabled FROM users WHERE id=$1", [
          principal.id,
        ])
      ).rows[0];
      if (!user || user.disabled) throw missing();
      if (principal.type === "agent" && user.is_admin)
        await db.query("SELECT set_config('agentstack.is_admin','true',true)");
      const p = await db.query("SELECT id FROM projects WHERE id=$1", [
        projectId,
      ]);
      if (!p.rowCount) throw missing();
      const membership = (
        await db.query(
          "SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 AND revoked_at IS NULL",
          [projectId, principal.id],
        )
      ).rows[0];
      const role: Role = user.is_admin ? "admin" : membership?.role;
      if (!role) throw missing();
      if (principal.type === "agent" && role === "customer") throw forbidden();
      await db.query("SELECT set_config('agentstack.project_id',$1,true)", [
        projectId,
      ]);
      return fn({ db, principal, projectId, role });
    });
  }
  async assertRestrictedRole() {
    const role = (
      await this.pool.query(
        "SELECT r.rolsuper, r.rolbypassrls, EXISTS(SELECT 1 FROM pg_class c WHERE c.relname='objects' AND c.relowner=r.oid) AS owns_objects FROM pg_roles r WHERE r.rolname=current_user",
      )
    ).rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.owns_objects)
      throw new Error(
        "The API requires a non-owner PostgreSQL role without SUPERUSER or BYPASSRLS. Run migrations separately.",
      );
  }
  async close() {
    await this.pool.end();
  }
}
export const canEdit = (ctx: Context) => {
  if (ctx.role === "customer") throw forbidden();
};
export const human = (ctx: Context) => {
  if (ctx.principal.type !== "human") throw forbidden();
};
export const admin = (ctx: Context) => {
  human(ctx);
  if (!ctx.principal.isAdmin) throw forbidden();
};
