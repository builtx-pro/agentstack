import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@shared/api/client";
import { QueryKeys } from "@shared/lib/query-keys.constant";
import * as api from "../api/repositories.api";
import type { RepositoryDraft, ApplyEntry } from "../model/repository.schema";
const keys = {
  all: (id: string) => ["repositories", id] as const,
  list: (id: string) => ["repositories", id, "connections"] as const,
  snapshots: (id: string, connection: string) =>
    ["repositories", id, "snapshots", connection] as const,
  pipelines: (id: string) => ["repositories", id, "pipelines"] as const,
};
export function repositoryError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 413)
      return "This snapshot is too large. Narrow the tracked roots and fetch again.";
    if (error.status === 409)
      return "This connection or project item changed. Refresh the preview before applying.";
    if (error.status === 403)
      return "Your role cannot perform this repository action.";
    if (error.status === 429)
      return "The provider is rate limited. Try again later.";
    if (error.status === 401) return "Sign in again to continue.";
  }
  return "The repository request did not complete. Check the connection and try again. No automatic retry was made.";
}
export const useRepositories = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.list(id),
    queryFn: ({ signal }) => api.listRepositories(id, signal),
    enabled,
    retry: false,
  });
export const useSnapshots = (id: string, connection: string, enabled = true) =>
  useQuery({
    queryKey: keys.snapshots(id, connection),
    queryFn: ({ signal }) => api.listSnapshots(id, connection, signal),
    enabled: !!connection && enabled,
    retry: false,
  });
export const useSnapshot = (id: string, connection: string, snapshot: string) =>
  useQuery({
    queryKey: [...keys.snapshots(id, connection), snapshot],
    queryFn: ({ signal }) => api.getSnapshot(id, connection, snapshot, signal),
    enabled: !!connection && !!snapshot,
    refetchOnWindowFocus: false,
    retry: false,
  });
export const usePipelines = (id: string) =>
  useQuery({
    queryKey: keys.pipelines(id),
    queryFn: ({ signal }) => api.listPipelines(id, signal),
    retry: false,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
export function useRepositoryActions(id: string) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: keys.all(id) });
  const quiet = () => {};
  const create = useMutation({
    mutationFn: (draft: RepositoryDraft) => api.createRepository(id, draft),
    onSuccess: refresh,
    onError: quiet,
    retry: false,
  });
  const patch = useMutation({
    mutationFn: ({
      connection,
      ...body
    }: {
      connection: string;
      expectedVersion: number;
      token?: string | null;
      archived?: boolean;
      sharePipelines?: boolean;
      label?: string;
      branch?: string;
      roots?: string[];
    }) => api.patchRepository(id, connection, body),
    onSuccess: refresh,
    onError: quiet,
    retry: false,
  });
  const pull = useMutation({
    mutationFn: ({
      connection,
      expectedVersion,
    }: {
      connection: string;
      expectedVersion: number;
    }) => api.refreshRepository(id, connection, expectedVersion),
    onSuccess: refresh,
    onError: quiet,
    retry: false,
  });
  const apply = useMutation({
    mutationFn: ({
      connection,
      snapshot,
      expectedVersion,
      entries,
    }: {
      connection: string;
      snapshot: string;
      expectedVersion: number;
      entries: ApplyEntry[];
    }) => api.applySnapshot(id, connection, snapshot, expectedVersion, entries),
    onSuccess: async () => {
      await Promise.all([
        refresh(),
        client.invalidateQueries({ queryKey: QueryKeys.objects(id) }),
        client.invalidateQueries({ queryKey: QueryKeys.progress(id) }),
        client.invalidateQueries({ queryKey: QueryKeys.activity(id) }),
        client.invalidateQueries({
          queryKey: [...QueryKeys.project(id), "history"],
        }),
      ]);
    },
    onError: quiet,
    retry: false,
  });
  return { create, patch, pull, apply, reload: refresh };
}

export const useRepositoryBindings = (projectId: string, objectId: string) =>
  useQuery({
    queryKey: [...keys.all(projectId), "bindings", objectId],
    // Preserve one in-flight read across development StrictMode remounts.
    queryFn: () => api.listRepositoryBindings(projectId, objectId),
    enabled: !!projectId && !!objectId,
    retry: false,
    refetchOnWindowFocus: false,
  });
