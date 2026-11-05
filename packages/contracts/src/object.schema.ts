import { z } from "zod";
export const objectKindSchema = z.enum([
  "screen",
  "flow",
  "asset",
  "document",
  "rule",
  "wave",
  "epic",
  "story",
  "sprint",
  "feature",
  "proposal",
]);
export const visibilitySchema = z.enum(["team", "customer"]);
export const workStatusSchema = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
]);
export const idSchema = z.uuid();
export const textSchema = z.string().trim().min(1).max(240);
export const urlSchema = z
  .url()
  .refine(
    (v) => ["http:", "https:"].includes(new URL(v).protocol),
    "Only HTTP(S) URLs are supported",
  );
const ref = z.string().min(1).max(200);
const refs = z
  .array(ref)
  .max(2000)
  .refine((v) => new Set(v).size === v.length, "Duplicate references");
const checklist = z
  .array(
    z
      .object({
        id: z.string().min(1).max(100),
        text: z.string().min(1).max(2000),
        done: z.boolean(),
      })
      .strict(),
  )
  .max(200)
  .refine(
    (v) => new Set(v.map((x) => x.id)).size === v.length,
    "Duplicate checklist identifiers",
  );
export const objectDataSchemas = {
  screen: z
    .object({
      screenId: z.string().max(200).optional(),
      variant: z.string().max(80).optional(),
      palette: z.string().max(80).optional(),
      frame: z.enum(["mobile", "desktop"]).optional(),
      imageFileId: idSchema.optional(),
      previewUrl: urlSchema.optional(),
      sourcePath: z.string().max(500).optional(),
      assetIds: refs.optional(),
    })
    .strict(),
  asset: z
    .object({
      fileId: idSchema.optional(),
      category: z.string().max(100).optional(),
      source: z.string().max(1000).optional(),
      license: z.string().max(200).optional(),
      variant: z.string().max(80).optional(),
    })
    .strict(),
  flow: z
    .object({
      screenIds: refs,
      stateIds: refs.optional(),
      role: z.string().max(100).optional(),
      phase: z.string().max(100).optional(),
    })
    .strict(),
  document: z.object({ markdown: z.string().max(200000) }).strict(),
  rule: z.object({ markdown: z.string().max(200000) }).strict(),
  wave: z.object({}).strict(),
  epic: z.object({ waveId: ref.optional() }).strict(),
  sprint: z
    .object({
      goal: z.string().max(4000).optional(),
      startDate: z.iso.date().optional(),
      endDate: z.iso.date().optional(),
    })
    .strict()
    .refine(
      (v) => !v.startDate || !v.endDate || v.startDate <= v.endDate,
      "Start date must not follow end date",
    ),
  story: z
    .object({
      epicId: ref.optional(),
      sprintId: ref.optional(),
      featureIds: refs.optional(),
      assigneeId: idSchema.optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      blocked: z.boolean().optional(),
      checklist: checklist.optional(),
    })
    .strict(),
  feature: z.object({}).strict(),
  proposal: z
    .object({
      proposalType: z.enum(["feature", "fix"]).optional(),
      linkedStoryId: ref.optional(),
      decision: z.string().max(4000).optional(),
    })
    .strict(),
} as const;
const fields = {
  key: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\p{L}\p{N}_:.\/-]+$/u),
  kind: objectKindSchema,
  title: textSchema,
  description: z.string().max(8000).default(""),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  visibility: visibilitySchema.default("team"),
  status: workStatusSchema.default("backlog"),
  data: z.record(z.string(), z.unknown()),
};
export const objectDraftSchema = z
  .object(fields)
  .strict()
  .superRefine((v, ctx) => {
    const parsed = objectDataSchemas[v.kind].safeParse(v.data);
    if (!parsed.success)
      for (const e of parsed.error.issues)
        ctx.addIssue({
          code: "custom",
          message: e.message,
          path: ["data", ...e.path],
        });
  });
export const objectPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: textSchema.optional(),
    description: fields.description.optional(),
    tags: fields.tags.optional(),
    visibility: visibilitySchema.optional(),
    status: workStatusSchema.optional(),
    archived: z.boolean().optional(),
    data: fields.data.optional(),
  })
  .strict();
export const projectObjectSchema = z.object({
  ...fields,
  id: idSchema,
  projectId: idSchema,
  version: z.number().int().positive(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ObjectKind = z.infer<typeof objectKindSchema>;
export type ObjectDraft = z.infer<typeof objectDraftSchema>;
export type ObjectPatch = z.infer<typeof objectPatchSchema>;
export type ProjectObject = z.infer<typeof projectObjectSchema>;
export const restoreSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    revisionVersion: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  tag: z.string().max(80).optional(),
  kind: objectKindSchema.optional(),
  status: z.string().max(40).optional(),
  archived: z.enum(["true", "false", "all"]).default("false"),
  targetId: idSchema.optional(),
});
// Catalog pages are bounded separately; other API collections retain the 100-row cap.
export const objectListQuerySchema = listQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
});
export const listSchema = <T extends z.ZodType>(schema: T) =>
  z.object({ items: z.array(schema), nextCursor: z.string().nullable() });
