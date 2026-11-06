import { z } from "zod";
import { request, mutationOptions } from "@shared/api/client";
import { listSchema, objectSchema } from "@shared/api/schemas";
import {
  taskSchema,
  type Task,
  type TaskFilters,
  type PersonalDraft,
} from "../model/task.schema";
export async function getTaskPage(
  filters: TaskFilters,
  cursor: string | undefined,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    source: filters.source,
    archived: filters.archived,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    limit: "60",
    ...(cursor ? { cursor } : {}),
  });
  return request(`/tasks?${query}`, listSchema(taskSchema), { signal });
}
export function savePersonalTask(
  draft: PersonalDraft,
  id: string,
  version?: number,
) {
  return request(
    version ? `/tasks/${encodeURIComponent(id)}` : "/tasks",
    taskSchema,
    mutationOptions(version ? "PATCH" : "POST", {
      ...draft,
      ...(version ? { expectedVersion: version } : { id }),
    }),
  );
}
export function patchPersonalTask(
  task: Task,
  patch: Partial<Pick<Task, "status" | "archived">>,
) {
  return request(
    `/tasks/${encodeURIComponent(task.id)}`,
    taskSchema,
    mutationOptions("PATCH", { expectedVersion: task.version, ...patch }),
  );
}
export function moveProjectTask(task: Task, status: Task["status"]) {
  return request(
    `/projects/${task.projectId}/objects/${task.id}`,
    objectSchema,
    mutationOptions("PATCH", { expectedVersion: task.version, status }),
  );
}
export const taskHistorySchema = z
  .object({ version: z.number(), createdAt: z.string(), snapshot: taskSchema })
  .passthrough();
export function getTaskHistory(
  id: string,
  cursor: string | undefined,
  signal?: AbortSignal,
) {
  return request(
    `/tasks/${id}/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    listSchema(taskHistorySchema),
    { signal },
  );
}

export const getPersonalTask = (id: string) =>
  request(`/tasks/${encodeURIComponent(id)}`, taskSchema);
