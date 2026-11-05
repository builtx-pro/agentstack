import type { Context } from "../db/database.service.js";

export type RuleRevision = { id: string; version: number };

/** Serialize rule edits and claim/submit checks, including concurrent rule insertion. */
export async function lockProjectRules(ctx: Context) {
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `rules:${ctx.projectId}`,
  ]);
}

export async function activeRuleRevisions(ctx: Context): Promise<RuleRevision[]> {
  return (await ctx.db.query(
    "SELECT id,version FROM objects WHERE project_id=$1 AND kind='rule' AND NOT archived ORDER BY id",
    [ctx.projectId],
  )).rows;
}
