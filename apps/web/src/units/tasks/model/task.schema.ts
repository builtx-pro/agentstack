import { z } from "zod";
import { statusSchema } from "@shared/api/schemas";
export const taskSchema = z.object({
  source: z.enum(["personal", "project"]),
  canEdit: z.boolean(),
  id: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  status: statusSchema,
  version: z.number(),
  archived: z.boolean(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  blocked: z.boolean(),
  checklist: z.array(
    z.object({ id: z.string(), text: z.string(), done: z.boolean() }),
  ),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Task = z.infer<typeof taskSchema>;
export type TaskFilters = {
  source: "all" | "personal" | "assigned";
  q: string;
  status: string;
  archived: "false" | "true" | "all";
};
export type PersonalDraft = Pick<
  Task,
  | "title"
  | "description"
  | "status"
  | "priority"
  | "blocked"
  | "checklist"
  | "tags"
>;
