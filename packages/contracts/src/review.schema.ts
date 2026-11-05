import { z } from "zod";
import { idSchema, visibilitySchema, urlSchema } from "./object.schema.js";
export const noteStatusSchema = z.enum([
  "open",
  "in_progress",
  "ready_for_review",
  "resolved",
]);
export const reviewResultSchema = z
  .object({
    summary: z.string().trim().min(1).max(4000),
    revision: z.string().max(500).optional(),
    previewUrl: urlSchema.optional(),
    checks: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            result: z.enum(["passed", "failed", "not_run"]),
            details: z.string().max(4000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    evidenceSource: z.enum(["agent", "human"]).optional(),
  })
  .strict();
export const noteDraftSchema = z
  .object({
    targetId: idSchema,
    targetVersion: z.number().int().positive(),
    body: z.string().trim().min(1).max(8000),
    visibility: visibilitySchema.default("customer"),
  })
  .strict();
export const notePatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    body: z.string().trim().min(1).max(8000),
  })
  .strict();
export const noteTransitionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    action: z.enum(["claim", "submit", "resolve", "reopen", "release"]),
    reason: z.string().trim().min(1).max(4000).optional(),
    result: reviewResultSchema.optional(),
  })
  .strict();
export const reviewNoteSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  targetId: idSchema,
  targetVersion: z.number().int(),
  body: z.string(),
  authorName: z.string(),
  visibility: visibilitySchema,
  status: noteStatusSchema,
  version: z.number().int(),
  claimedBy: z.string().nullable().optional(),
  claimedRuleRevisions: z.array(z.object({id: idSchema, version: z.number().int().positive()}).strict()).nullable().optional(),
  claimExpiresAt: z.string().nullable().optional(),
  result: reviewResultSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReviewNote = z.infer<typeof reviewNoteSchema>;
export type NoteDraft = z.infer<typeof noteDraftSchema>;
export type NoteTransition = z.infer<typeof noteTransitionSchema>;
