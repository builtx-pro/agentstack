import type { Context } from "../db/database.service.js";
import { AppError, conflict } from "./errors.js";
import { requestHash } from "./crypto.util.js";
export async function idempotent<T>(
  ctx: Context,
  key: string | undefined,
  operation: string,
  body: unknown,
  run: () => Promise<T>,
): Promise<T> {
  if (!key || key.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(key))
    throw new AppError(
      400,
      "idempotency_required",
      "Provide an Idempotency-Key header.",
    );
  const fingerprint = requestHash(body);
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `${ctx.projectId}:${ctx.principal.key}:${key}`,
  ]);
  const old = (
    await ctx.db.query(
      "SELECT operation,request_hash,response FROM idempotency_keys WHERE project_id=$1 AND actor_key=$2 AND key=$3",
      [ctx.projectId, ctx.principal.key, key],
    )
  ).rows[0];
  if (old) {
    if (old.operation !== operation || old.request_hash !== fingerprint)
      throw conflict(
        "This idempotency key was already used for a different request.",
      );
    return old.response as T;
  }
  const response = await run();
  await ctx.db.query(
    "INSERT INTO idempotency_keys(project_id,actor_key,key,operation,request_hash,response) VALUES($1,$2,$3,$4,$5,$6)",
    [
      ctx.projectId,
      ctx.principal.key,
      key,
      operation,
      fingerprint,
      JSON.stringify(response),
    ],
  );
  return response;
}
