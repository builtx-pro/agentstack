import { randomUUID } from "node:crypto";
import type { Context } from "../db/database.service.js";
export async function audit(
  ctx: Context,
  action: string,
  summary: string,
  targetId: string | null = null,
  visibility = "team",
  data: Record<string, unknown> = {},
) {
  await ctx.db.query(
    "INSERT INTO audit_events(id,project_id,actor_id,actor_name,source,action,target_id,visibility,summary,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      randomUUID(),
      ctx.projectId,
      ctx.principal.id,
      ctx.principal.name,
      ctx.principal.type === "agent" ? "agent" : "web",
      action,
      targetId,
      visibility,
      summary,
      JSON.stringify(data),
    ],
  );
}
