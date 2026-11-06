import type { ProjectObject } from "@shared/api/schemas";
import { taskSchema, type Task } from "../model/task.schema";
export const taskStatuses = [
  "backlog",
  "ready",
  "in_progress",
  "review",
  "done",
] as const;
export function groupTasks<T extends { status: string }>(items: T[]) {
  return taskStatuses.map((status) => ({
    status,
    items: items.filter((item) => item.status === status),
  }));
}
export function storyTask(item: ProjectObject, projectName: string): Task {
  return taskSchema.parse({
    ...item,
    source: "project",
    canEdit: true,
    projectName,
    priority: item.data.priority ?? "normal",
    blocked: item.data.blocked ?? false,
    checklist: item.data.checklist ?? [],
  });
}
