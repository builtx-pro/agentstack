import { z } from "zod";
import { objectKindSchema, statusSchema } from "@shared/api/schemas";
export const pipelineSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum([
    "queued",
    "running",
    "passed",
    "failed",
    "cancelled",
    "skipped",
    "unknown",
  ]),
  commit: z.string().optional(),
  url: z.string().optional(),
  updatedAt: z.string(),
  source: z.enum(["provider", "reported"]),
});
export const repositorySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  provider: z.enum(["github", "gitlab", "local"]),
  repository: z.string(),
  branch: z.string(),
  label: z.string(),
  roots: z.array(z.string()),
  version: z.number(),
  archived: z.boolean(),
  hasCredential: z.boolean(),
  sharePipelines: z.boolean(),
  updatedAt: z.string(),
});
export const draftSchema = z.object({
  key: z.string(),
  kind: objectKindSchema,
  title: z.string(),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  visibility: z.enum(["team", "customer"]),
  status: statusSchema,
  data: z.record(z.string(), z.unknown()),
});
export const entrySchema = z.object({
  key: z.string(),
  path: z.string(),
  kind: objectKindSchema,
  title: z.string(),
  state: z.enum(["new", "changed", "unchanged", "conflict", "missing"]),
  currentVersion: z.number().nullish(),
  draft: draftSchema.nullish(),
  reason: z.string().optional(),
});
export const snapshotSummarySchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  projectId: z.string(),
  commit: z.string(),
  branch: z.string(),
  source: z.enum(["provider", "reported"]),
  createdAt: z.string(),
  pipelines: z.array(pipelineSchema),
  entryCount: z.number(),
});
export const pipelineGroupSchema = z.object({
  connectionId: z.string(),
  label: z.string(),
  provider: z.enum(["github", "gitlab", "local"]),
  lastCheckedAt: z.string().nullish(),
  pipelines: z.array(pipelineSchema),
});
export const snapshotSchema = z.object({
  id: z.string(),
  connectionId: z.string(),
  projectId: z.string(),
  commit: z.string(),
  branch: z.string(),
  source: z.enum(["provider", "reported"]),
  createdAt: z.string(),
  pipelines: z.array(pipelineSchema),
  entries: z.array(entrySchema),
  counts: z.record(z.string(), z.number()),
});
export type Repository = z.infer<typeof repositorySchema>;
export type RepositorySnapshot = z.infer<typeof snapshotSchema>;
export type RepositoryEntry = z.infer<typeof entrySchema>;
export type Pipeline = z.infer<typeof pipelineSchema>;
export type RepositoryDraft = {
  provider: "github" | "gitlab" | "local";
  repository: string;
  branch: string;
  label: string;
  roots: string[];
  token?: string;
  sharePipelines: boolean;
};
export type ApplyEntry = {
  key: string;
  expectedObjectVersion: number | null;
  resolveConflict?: boolean;
};

export type PipelineGroup = z.infer<typeof pipelineGroupSchema>;

export const repositoryBindingSchema = z.object({
  objectId: z.string(),
  connectionId: z.string(),
  label: z.string(),
  path: z.string(),
  commit: z.string(),
  sourceHash: z.string(),
  lastAppliedVersion: z.number(),
  sourceUrl: z.string().optional(),
});
export type RepositoryBinding = z.infer<typeof repositoryBindingSchema>;
