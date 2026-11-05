import { z } from "zod";

export const idSchema = z.string().uuid();
export const versionSchema = z.number().int().positive();
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
export const objectStatusSchema = z.enum([
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
]);
export const noteStatusSchema = z.enum([
  "open",
  "in_progress",
  "ready_for_review",
  "resolved",
]);
export const visibilitySchema = z.enum(["team", "customer"]);
export const jsonDataSchema = z.record(z.string(), z.json());
export const projectSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().optional().default(""),
  version: versionSchema.optional(),
  archived: z.boolean().optional(),
  role: z.enum(["admin", "developer", "customer"]).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export const objectSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  key: z.string(),
  kind: objectKindSchema,
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  visibility: visibilitySchema,
  status: objectStatusSchema,
  archived: z.boolean(),
  version: versionSchema,
  data: jsonDataSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const objectDraftSchema = z.object({
  key: z.string().min(1).max(200),
  kind: objectKindSchema,
  title: z.string().min(1).max(240),
  description: z.string().max(8000).optional(),
  tags: z.array(z.string().max(80)).max(40).optional(),
  visibility: visibilitySchema.optional(),
  status: objectStatusSchema.optional(),
  data: jsonDataSchema,
});
export const objectPatchSchema = objectDraftSchema
  .omit({ key: true, kind: true })
  .partial()
  .extend({ expectedVersion: versionSchema, archived: z.boolean().optional() });
export const resultInputSchema = z.object({
  summary: z.string().min(1).max(4000),
  revision: z.string().max(500).optional(),
  previewUrl: z.string().url().optional(),
  checks: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        result: z.enum(["passed", "failed", "not_run"]),
        details: z.string().max(4000).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export const resultSchema = resultInputSchema.extend({
  evidenceSource: z.enum(["agent", "human"]),
});
export const noteSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  targetId: idSchema,
  targetVersion: versionSchema,
  body: z.string(),
  authorName: z.string(),
  visibility: visibilitySchema,
  status: noteStatusSchema,
  version: versionSchema,
  claimedBy: z.string().nullable().optional(),
  claimExpiresAt: z.string().nullable().optional(),
  claimedRuleRevisions: z.array(z.object({id:idSchema,version:versionSchema})).nullable().optional(),
  result: resultSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  imported: z.boolean().optional(),
});
export const noteDraftSchema = z.object({
  targetId: idSchema,
  targetVersion: versionSchema,
  body: z.string().min(1).max(8000),
  visibility: visibilitySchema.optional(),
});
export const transitionSchema = z.object({
  expectedVersion: versionSchema,
  action: z.enum(["claim", "submit", "resolve", "reopen", "release"]),
  reason: z.string().max(4000).optional(),
  result: resultInputSchema.optional(),
});
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export const historySchema = z.object({
  id: z.string(),
  version: versionSchema,
  actorName: z.string(),
  source: z.string(),
  createdAt: z.string(),
  summary: z.string(),
  snapshot: z.json(),
});
export const capabilitiesSchema = z.object({
  version: z.string(),
  apiVersion: z.literal(1),
  objectKinds: z.array(objectKindSchema),
  features: z.array(z.string()),
  mcpTransport: z.literal("stdio"),
});
const countSchema = z.number().int().nonnegative();
export const progressSchema = z.object({
  total: countSchema,
  done: countSchema,
  percent: z.number().min(0).max(100),
  byStatus: z.record(z.string(), countSchema),
  groups: z.array(
    z.object({
      id: idSchema,
      title: z.string(),
      kind: objectKindSchema,
      total: countSchema,
      done: countSchema,
      percent: z.number(),
    }),
  ),
  notes: z.object({
    open: countSchema,
    in_progress: countSchema,
    ready_for_review: countSchema,
    resolved: countSchema,
  }),
  timeline: z.array(
    z.object({ date: z.string(), total: countSchema, done: countSchema }),
  ),
});
export const contextSchema = z.object({
  project: projectSchema,
  capabilities: capabilitiesSchema,
  rules: z.array(objectSchema),
  documents: z.array(objectSchema),
  planning: z.array(objectSchema),
  notes: z.array(noteSchema),
  activeClaims: z.array(noteSchema).optional(),
  truncated: z.record(z.string(), z.boolean()),
  nextNoteCursor: z.string().nullable().optional(),
  nextCursors: z
    .object({
      rules: z.string().nullable(),
      documents: z.string().nullable(),
      planning: z.string().nullable(),
      notes: z.string().nullable(),
      activeClaims: z.string().nullable().optional(),
    })
    .optional(),
  continuations: z
    .record(
      z.string(),
      z.object({
        path: z.string(),
        query: z.record(z.string(), z.union([z.string(), z.number()])),
        filterKinds: z.array(objectKindSchema).optional(),
      }),
    )
    .optional(),
  omittedObjects: z
    .array(
      z.object({
        id: idSchema,
        key: z.string(),
        kind: objectKindSchema,
        title: z.string(),
        version: versionSchema,
        path: z.string(),
        reason: z.literal("context_budget"),
      }),
    )
    .optional(),
  contextBudget: z
    .object({
      maxBytes: z.number().int().nonnegative(),
      usedBytes: z.number().int().nonnegative(),
      complete: z.boolean(),
    })
    .optional(),
});
export const fileSchema = z.object({
  id: idSchema,
  name: z.string(),
  mimeType: z.string(),
  size: countSchema,
  sha256: z.string(),
  url: z.string(),
});
export const manifestFileSchema = z.object({
  key: z.string().min(1).max(200),
  path: z.string().min(1).max(2000).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z
    .number()
    .int()
    .positive()
    .max(12 * 1024 * 1024),
  mimeType: z.enum([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/avif",
    "image/svg+xml",
  ]),
});
export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  project: z.object({ name: z.string(), slug: z.string() }).optional(),
  objects: z
    .array(
      objectDraftSchema.extend({
        baseVersion: versionSchema.optional(),
        archived: z.boolean().optional(),
      }),
    )
    .max(12000),
  files: z.array(manifestFileSchema).max(12000).optional().default([]),
  source: z
    .object({
      commit: z.string().max(100).optional(),
      branch: z.string().max(300).optional(),
    })
    .optional(),
});
export const importReportSchema = z.object({
  dryRun: z.boolean(),
  created: countSchema,
  updated: countSchema,
  unchanged: countSchema,
  items: z.array(
    z.object({
      key: z.string(),
      id: idSchema,
      action: z.enum(["create", "update", "unchanged", "created", "updated"]),
      version: versionSchema,
    }),
  ),
  source: z
    .object({ commit: z.string().optional(), branch: z.string().optional() })
    .nullable()
    .optional(),
});

export type Project = z.infer<typeof projectSchema>;
export type ProjectObject = z.infer<typeof objectSchema>;
export type ObjectKind = z.infer<typeof objectKindSchema>;
export type ObjectDraft = z.infer<typeof objectDraftSchema>;
export type ObjectPatch = z.infer<typeof objectPatchSchema>;
export type ReviewNote = z.infer<typeof noteSchema>;
export type NoteDraft = z.infer<typeof noteDraftSchema>;
export type ReviewResultInput = z.infer<typeof resultInputSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export type Page<T> = { items: T[]; nextCursor: string | null };
