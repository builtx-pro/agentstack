import { z } from "zod";
import { request, mutationOptions } from "@shared/api/client";
import {
  repositorySchema,
  repositoryBindingSchema,
  snapshotSchema,
  snapshotSummarySchema,
  pipelineGroupSchema,
  type RepositoryDraft,
  type ApplyEntry,
} from "../model/repository.schema";
const base = (projectId: string) =>
  `/projects/${encodeURIComponent(projectId)}/repositories`;
export const listRepositories = (projectId: string, signal?: AbortSignal) =>
  request(
    base(projectId),
    z.object({
      items: z.array(repositorySchema),
      nextCursor: z.string().nullish(),
    }),
    { signal },
  );
export const createRepository = (projectId: string, draft: RepositoryDraft) =>
  request(base(projectId), repositorySchema, mutationOptions("POST", draft));
export const patchRepository = (
  projectId: string,
  id: string,
  body: {
    expectedVersion: number;
    token?: string | null;
    archived?: boolean;
    sharePipelines?: boolean;
    label?: string;
    branch?: string;
    roots?: string[];
  },
) =>
  request(
    `${base(projectId)}/${encodeURIComponent(id)}`,
    repositorySchema,
    mutationOptions("PATCH", body),
  );
export const refreshRepository = (
  projectId: string,
  id: string,
  expectedVersion: number,
) =>
  request(
    `${base(projectId)}/${encodeURIComponent(id)}/refresh`,
    snapshotSchema,
    mutationOptions("POST", { expectedVersion }),
  );
export const listSnapshots = (
  projectId: string,
  id: string,
  signal?: AbortSignal,
) =>
  request(
    `${base(projectId)}/${encodeURIComponent(id)}/snapshots`,
    z.object({
      items: z.array(snapshotSummarySchema),
      nextCursor: z.string().nullish(),
    }),
    { signal },
  );
export const getSnapshot = (
  projectId: string,
  id: string,
  snapshotId: string,
  signal?: AbortSignal,
) =>
  request(
    `${base(projectId)}/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshotId)}`,
    snapshotSchema,
    { signal },
  );
export const applySnapshot = (
  projectId: string,
  id: string,
  snapshotId: string,
  expectedVersion: number,
  entries: ApplyEntry[],
) =>
  request(
    `${base(projectId)}/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshotId)}/apply`,
    z.unknown(),
    mutationOptions("POST", { expectedVersion, entries }),
  );
export const listPipelines = (projectId: string, signal?: AbortSignal) =>
  request(
    `${base(projectId)}/pipelines`,
    z.object({
      items: z.array(pipelineGroupSchema),
      nextCursor: z.string().nullish(),
    }),
    { signal },
  );

export const listRepositoryBindings = (
  projectId: string,
  objectId: string,
  signal?: AbortSignal,
) =>
  request(
    `${base(projectId)}/bindings?objectId=${encodeURIComponent(objectId)}`,
    z.object({
      items: z.array(repositoryBindingSchema),
      nextCursor: z.string().nullish(),
    }),
    { signal },
  );
