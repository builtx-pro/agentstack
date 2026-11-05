import { z } from "zod";
import {
  idSchema,
  versionSchema,
  objectKindSchema,
  objectDraftSchema,
} from "./schemas.schema.js";
const commitSchema = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i);
export const repositoryProviderSchema = z.enum(["github", "gitlab", "local"]);
export const repositorySchema = z.object({
  id: idSchema,
  projectId: idSchema,
  provider: repositoryProviderSchema,
  repository: z.string(),
  branch: z.string(),
  label: z.string(),
  roots: z.array(z.string()),
  version: versionSchema,
  archived: z.boolean(),
  hasCredential: z.boolean(),
  sharePipelines: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const repositoryPipelineSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(240),
  status: z.enum([
    "queued",
    "running",
    "passed",
    "failed",
    "cancelled",
    "skipped",
    "unknown",
  ]),
  commit: commitSchema.optional(),
  url: z
    .string()
    .url()
    .refine((value) => {
      const u = new URL(value);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        ["github.com", "gitlab.com"].includes(u.hostname)
      );
    })
    .optional(),
  updatedAt: z.string().datetime(),
  source: z.enum(["provider", "reported"]),
});
export const repositorySnapshotSummarySchema = z.object({
  id: idSchema,
  connectionId: idSchema,
  projectId: idSchema,
  commit: commitSchema,
  branch: z.string(),
  source: z.enum(["provider", "reported"]),
  createdAt: z.string(),
  pipelines: z.array(repositoryPipelineSchema),
  entryCount: z.number().int().nonnegative(),
});
export const repositorySnapshotSchema = repositorySnapshotSummarySchema.extend({
  entries: z.array(
    z.object({
      key: z.string(),
      path: z.string(),
      kind: objectKindSchema,
      title: z.string(),
      state: z.enum(["new", "changed", "unchanged", "conflict", "missing"]),
      currentVersion: versionSchema.nullable(),
      draft: objectDraftSchema.nullable(),
      reason: z.string().optional(),
    }),
  ),
  counts: z.object({
    new: z.number().int().nonnegative(),
    changed: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    conflict: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
  }),
});
export const repositoryPipelineGroupSchema = z.object({
  connectionId: idSchema,
  label: z.string(),
  provider: repositoryProviderSchema,
  lastCheckedAt: z.string().nullable(),
  pipelines: z.array(repositoryPipelineSchema),
});
const pathSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !/[\x00-\x1f]/.test(value) &&
      !value.split("/").some((part) => !part || part === "." || part === ".."),
  );
export const repositorySnapshotInputSchema = z
  .object({
    expectedVersion: versionSchema,
    branch: z.string().min(1).max(200),
    commit: commitSchema,
    files: z
      .array(
        z
          .object({
            path: pathSchema,
            content: z
              .string()
              .refine(
                (value) => new TextEncoder().encode(value).length <= 128 * 1024,
              ),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    pipelines: z
      .array(repositoryPipelineSchema.extend({ commit: commitSchema }))
      .max(20)
      .default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.files.reduce(
        (total, file) => total + new TextEncoder().encode(file.content).length,
        0,
      ) <=
      4 * 1024 * 1024,
  );
export type Repository = z.infer<typeof repositorySchema>;
export type RepositorySnapshot = z.infer<typeof repositorySnapshotSchema>;
export type RepositorySnapshotInput = z.input<
  typeof repositorySnapshotInputSchema
>;
