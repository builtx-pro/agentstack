import { z } from "zod";
import type { Context } from "../db/database.service.js";
import { isCustomer } from "../objects/objects.service.js";
import { getNote } from "../reviews/reviews.service.js";
import { missing } from "../shared/errors.js";

export const legacyQuerySchema = z
  .object({
    kind: z.enum(["screen", "asset"]),
    key: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\p{L}\p{N}_:.\/-]+$/u),
    note: z
      .string()
      .regex(/^[1-9]\d{0,18}$/)
      .optional(),
  })
  .strict();

/** Resolve old bookmarks through current authorization, never through private import provenance. */
export async function resolveLegacyLink(
  ctx: Context,
  input: z.infer<typeof legacyQuerySchema>,
): Promise<{
  targetId: string;
  section: "screens" | "assets";
  noteId?: string;
}> {
  const target = (
    await ctx.db.query(
      "SELECT id FROM objects WHERE project_id=$1 AND kind=$2 AND key=$3 AND ($4=false OR visibility='customer')",
      [ctx.projectId, input.kind, input.key, isCustomer(ctx)],
    )
  ).rows[0] as { id: string } | undefined;
  if (!target) throw missing();
  const result: {
    targetId: string;
    section: "screens" | "assets";
    noteId?: string;
  } = {
    targetId: target.id,
    section: input.kind === "screen" ? "screens" : "assets",
  };
  if (input.note !== undefined) {
    const link = (
      await ctx.db.query(
        "SELECT note_id FROM legacy_links WHERE project_id=$1 AND source='concepts' AND kind='comment' AND legacy_id=$2 AND target_id=$3",
        [ctx.projectId, input.note, target.id],
      )
    ).rows[0] as { note_id: string } | undefined;
    if (!link) throw missing();
    // This shared read checks note visibility, current target visibility and the referenced revision.
    const note = await getNote(ctx, link.note_id);
    if (note.targetId !== target.id) throw missing();
    result.noteId = note.id;
  }
  return result;
}
