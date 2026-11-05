import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { userDraftSchema } from "@agentstack/contracts";
import { hashPassword } from "../shared/crypto.util.js";
import { appendUserAudit, safeUserSnapshot } from "./user-audit.service.js";
export async function bootstrap(ownerUrl: string, input: unknown) {
  const value = userDraftSchema.parse(input);
  const pool = new Pool({ connectionString: ownerUrl });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('agentstack-bootstrap'))",
    );
    if ((await db.query("SELECT 1 FROM users WHERE is_admin=true")).rowCount)
      throw new Error(
        "An administrator already exists. Bootstrap is single use.",
      );
    const inserted = await db.query(
      "INSERT INTO users(id,email,name,password_hash,is_admin) VALUES($1,$2,$3,$4,true) RETURNING *",
      [
        randomUUID(),
        value.email,
        value.name,
        await hashPassword(value.password),
      ],
    );
    const user = safeUserSnapshot(inserted.rows[0]);
    await appendUserAudit(
      db,
      { id: user.id, name: user.name },
      "bootstrap",
      "user.bootstrap",
      null,
      user,
      ["created"],
    );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
    await pool.end();
  }
}
