import { Pool } from "pg";
import { readFile } from "node:fs/promises";
export const CURRENT_SCHEMA_VERSION = 3;
const migrations = [
  { version: 1, file: "001-initial.sql" },
  { version: 2, file: "002-user-audit.sql" },
  { version: 3, file: "003-claim-rule-snapshots.sql" },
] as const;
export async function migrate(ownerUrl: string, applicationPassword: string) {
  if (applicationPassword.length < 24)
    throw new Error(
      "APP_DATABASE_PASSWORD must contain at least 24 characters",
    );
  const pool = new Pool({ connectionString: ownerUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('agentstack-migrations'))",
    );
    const exists = (
      await client.query(
        "SELECT to_regclass('public.schema_migrations') AS name",
      )
    ).rows[0].name;
    const versions: number[] = exists
      ? (
          await client.query(
            "SELECT version FROM schema_migrations ORDER BY version",
          )
        ).rows.map((r) => r.version)
      : [];
    if (versions.some((version) => version > CURRENT_SCHEMA_VERSION))
      throw new Error(
        "Database schema is newer than this AgentStack release. No changes were applied.",
      );
    if (versions.some((version, index) => version !== index + 1))
      throw new Error(
        "Database migration history is not contiguous. No changes were applied.",
      );
    const role = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname='agentstack_app'",
    );
    const quoted = (
      await client.query("SELECT quote_literal($1) AS value", [
        applicationPassword,
      ])
    ).rows[0].value;
    await client.query(
      `${role.rowCount ? "ALTER" : "CREATE"} ROLE agentstack_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD ${quoted}`,
    );
    for (const migration of migrations)
      if (!versions.includes(migration.version))
        await client.query(
          await readFile(new URL(migration.file, import.meta.url), "utf8"),
        );
    await client.query("GRANT USAGE ON SCHEMA public TO agentstack_app");
    await client.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO agentstack_app",
    );
    await client.query(
      "REVOKE UPDATE,DELETE ON object_revisions,note_revisions,project_revisions,audit_events,installation_admin_audit FROM agentstack_app",
    );
    await client.query(
      "REVOKE INSERT,UPDATE,DELETE ON schema_migrations,legacy_links FROM agentstack_app",
    );
    await client.query("REVOKE ALL ON legacy_provenance FROM agentstack_app");
    await client.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
