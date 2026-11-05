import { z } from "zod";
import { idSchema, objectDraftSchema } from "./object.schema.js";
export const repositoryProviderSchema = z.enum(["github", "gitlab", "local"]);
export const repositoryRootSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (v) =>
      !v.startsWith("/") &&
      !v.includes("\\") &&
      !v.split("/").some((p) => !p || p === "." || p === "..") &&
      !/[\x00-\x1f]/.test(v),
    "Use a relative file or directory",
  );
const fields = {
  provider: repositoryProviderSchema,
  repository: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/),
  branch: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (v) =>
        !/[\x00-\x20~^:?*\[\\]/.test(v) &&
        !v.includes("..") &&
        !v.startsWith("-"),
      "Invalid branch",
    ),
  label: z.string().trim().min(1).max(160),
  roots: z
    .array(repositoryRootSchema)
    .min(1)
    .max(12)
    .default(["epics", "docs", "AGENTS.md", "CLAUDE.md"]),
  sharePipelines: z.boolean().default(false),
};
export const repositoryCreateSchema = z
  .object({ ...fields, token: z.string().min(1).max(4096).optional() })
  .strict();
export const repositoryPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    label: fields.label.optional(),
    branch: fields.branch.optional(),
    roots: fields.roots.optional(),
    sharePipelines: z.boolean().optional(),
    archived: z.boolean().optional(),
    token: z.string().min(1).max(4096).nullable().optional(),
  })
  .strict();
export const repositorySchema = z.object({
  ...fields,
  id: idSchema,
  projectId: idSchema,
  version: z.number().int().positive(),
  archived: z.boolean(),
  hasCredential: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const pipelineSchema = z
  .object({
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
    commit: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i),
    url: z
      .url()
      .refine((v) => {
        const u = new URL(v);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          ["github.com", "gitlab.com"].includes(u.hostname) &&
          !u.port
        );
      })
      .optional(),
    updatedAt: z.string().datetime(),
    source: z.enum(["provider", "reported"]).default("reported"),
  })
  .strict();
export const repositoryFileSchema = z
  .object({ path: repositoryRootSchema, content: z.string().max(131072) })
  .strict();
export const repositorySnapshotSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    branch: fields.branch,
    commit: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i),
    files: z.array(repositoryFileSchema).min(1).max(200),
    pipelines: z.array(pipelineSchema).max(20).default([]),
  })
  .strict();
export const repositoryRefreshSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const repositoryApplySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    entries: z
      .array(
        z
          .object({
            key: z.string().min(1).max(200),
            expectedObjectVersion: z.number().int().positive().nullable(),
            resolveConflict: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(600),
  })
  .strict();
export type RepositoryCreate = z.infer<typeof repositoryCreateSchema>;
export type RepositoryPatch = z.infer<typeof repositoryPatchSchema>;
export type Repository = z.infer<typeof repositorySchema>;
export type RepositorySnapshotInput = z.infer<typeof repositorySnapshotSchema>;
export type RepositoryApply = z.infer<typeof repositoryApplySchema>;
export type Pipeline = z.infer<typeof pipelineSchema>;
export interface RepositoryDraft {
  key: string;
  path: string;
  hash: string;
  draft: z.infer<typeof objectDraftSchema>;
}
