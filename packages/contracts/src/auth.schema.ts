import { z } from "zod";
import { idSchema, textSchema } from "./object.schema.js";
export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  name: textSchema,
  isAdmin: z.boolean(),
  version: z.number().int().positive().optional(),
  disabled: z.boolean().optional(),
});
export const roleSchema = z.enum(["admin", "developer", "customer"]);
export const projectSchema = z.object({
  id: idSchema,
  name: textSchema,
  slug: z.string(),
  description: z.string(),
  version: z.number().int(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  role: roleSchema.optional(),
});
export const loginSchema = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(200),
  })
  .strict();
export const passwordSchema = z.string().min(12).max(200);
export const userDraftSchema = z
  .object({
    email: z.email().transform((v) => v.toLowerCase()),
    name: textSchema,
    password: passwordSchema,
    isAdmin: z.boolean().default(false),
  })
  .strict();
export const projectDraftSchema = z
  .object({
    name: textSchema,
    slug: z
      .string()
      .min(2)
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().max(8000).default(""),
  })
  .strict();
export const tokenScopeSchema = z.enum(["read", "write", "review"]);
export const tokenDraftSchema = z
  .object({
    name: textSchema,
    scopes: z
      .array(tokenScopeSchema)
      .min(1)
      .max(3)
      .refine(
        (v) => v.includes("read") && new Set(v).size === v.length,
        "Include read; no duplicates",
      ),
    expiresInDays: z.number().int().min(1).max(90).default(30),
  })
  .strict();
export type User = z.infer<typeof userSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Role = z.infer<typeof roleSchema>;
export type TokenScope = z.infer<typeof tokenScopeSchema>;

export const userPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: textSchema.optional(),
    password: passwordSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .strict();
