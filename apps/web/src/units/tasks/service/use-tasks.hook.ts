import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { QueryKeys } from "@shared/lib/query-keys.constant";
import * as api from "../api/tasks.api";
import type { Task, TaskFilters, PersonalDraft } from "../model/task.schema";
export const taskKeys = {
  list: (owner: string, filters: TaskFilters) =>
    ["my-tasks", owner, filters] as const,
  history: (owner: string, id: string) =>
    ["my-task-history", owner, id] as const,
};
export function useTasks(owner: string | undefined, filters: TaskFilters) {
  return useInfiniteQuery({
    queryKey: taskKeys.list(owner ?? "", filters),
    queryFn: ({ pageParam, signal }) =>
      api.getTaskPage(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!owner,
    staleTime: 15000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}
export function useTaskHistory(owner: string, id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: taskKeys.history(owner, id),
    queryFn: ({ pageParam, signal }) =>
      api.getTaskHistory(id, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
  });
}
export function useTaskActions(owner: string) {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["my-tasks", owner] });
  const save = useMutation({
    mutationFn: ({
      draft,
      id,
      version,
    }: {
      draft: PersonalDraft;
      id: string;
      version?: number;
    }) => api.savePersonalTask(draft, id, version),
    onError: () => {},
    onSuccess: async (saved) => {
      await Promise.all([
        refresh(),
        client.invalidateQueries({
          queryKey: taskKeys.history(owner, saved.id),
        }),
      ]);
    },
  });
  const move = useMutation({
    mutationFn: async ({
      task,
      status,
    }: {
      task: Task;
      status: Task["status"];
    }) => {
      if (task.source === "personal")
        await api.patchPersonalTask(task, { status });
      else await api.moveProjectTask(task, status);
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        refresh(),
        client.invalidateQueries({
          queryKey: taskKeys.history(owner, variables.task.id),
        }),
      ]);
      if (variables.task.projectId)
        await client.invalidateQueries({
          queryKey: QueryKeys.project(variables.task.projectId),
        });
    },
  });
  const archive = useMutation({
    mutationFn: (task: Task) =>
      api.patchPersonalTask(task, { archived: !task.archived }),
    onSuccess: async (_, task) => {
      await Promise.all([
        refresh(),
        client.invalidateQueries({
          queryKey: taskKeys.history(owner, task.id),
        }),
      ]);
    },
  });
  return { save, move, archive };
}
