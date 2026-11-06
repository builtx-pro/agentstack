import { z } from "zod";
import {
  idSchema,
  objectStatusSchema as workStatusSchema,
} from "./schemas.schema.js";
const textSchema = z.string().trim().min(1).max(240);
export const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const taskChecklistSchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(100),
        text: z.string().trim().min(1).max(2000),
        done: z.boolean(),
      })
      .strict(),
  )
  .max(200)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    "Duplicate checklist identifiers",
  );
const fields = {
  title: textSchema,
  description: z.string().max(8000),
  status: workStatusSchema,
  priority: taskPrioritySchema,
  blocked: z.boolean(),
  checklist: taskChecklistSchema,
  tags: z.array(z.string().trim().min(1).max(80)).max(40),
};
export const personalTaskDraftSchema = z
  .object({
    id: idSchema,
    ...fields,
    description: fields.description.default(""),
    status: fields.status.default("backlog"),
    priority: fields.priority.default("normal"),
    blocked: fields.blocked.default(false),
    checklist: fields.checklist.default([]),
    tags: fields.tags.default([]),
  })
  .strict();
export const personalTaskPatchSchema = z
  .object({ ...fields })
  .partial()
  .extend({
    expectedVersion: z.number().int().positive(),
    archived: z.boolean().optional(),
  })
  .strict();
export const taskItemSchema = z.object({
  id: idSchema,
  source: z.enum(["personal", "project"]),
  projectId: idSchema.nullable(),
  projectName: z.string().nullable(),
  canEdit: z.boolean(),
  ...fields,
  archived: z.boolean(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const taskListQuerySchema = z.object({
  source: z.enum(["all", "personal", "assigned"]).default("all"),
  status: workStatusSchema.optional(),
  q: z.string().max(200).optional(),
  archived: z.enum(["true", "false", "all"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(500).optional(),
});
export const taskHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .regex(/^\d{1,10}$/)
    .optional(),
});
export const taskHistoryEntrySchema = z.object({
  id: idSchema,
  version: z.number().int().positive(),
  action: z.string(),
  snapshot: taskItemSchema,
  createdAt: z.string(),
});
export type TaskItem = z.infer<typeof taskItemSchema>;
export type PersonalTaskDraft = z.infer<typeof personalTaskDraftSchema>;
export type PersonalTaskPatch = z.infer<typeof personalTaskPatchSchema>;
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;
