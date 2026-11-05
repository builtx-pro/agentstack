import { z } from "zod";
import { userSchema, passwordSchema } from "./auth.schema.js";
import { idSchema } from "./object.schema.js";
export const accountPreferencesSchema = z
  .object({
    locale: z.enum(["ru", "en"]).nullable(),
    theme: z.enum(["light", "dark", "auto"]),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    onboardingCompleted: z.boolean(),
  })
  .strict();
export const accountSchema = z.object({
  user: userSchema,
  version: z.number().int().positive(),
  preferences: accountPreferencesSchema,
  avatarUrl: z.string().nullable(),
  mfaEnabled: z.boolean(),
  recoveryCodesRemaining: z.number().int().nonnegative(),
});
export const accountPatchSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(200).optional(),
    preferences: accountPreferencesSchema.partial().optional(),
  })
  .strict();
export const accountPasswordProofSchema = z
  .object({ password: z.string().min(1).max(200) })
  .strict();
export const factorCodeSchema = z.string().trim().min(6).max(40);
export const accountFactorProofSchema = accountPasswordProofSchema.extend({
  code: factorCodeSchema,
});
export const passwordChangeSchema = accountPasswordProofSchema.extend({
  newPassword: passwordSchema,
  code: factorCodeSchema.optional(),
});
export const mfaChallengeSchema = z
  .object({ challenge: z.string().min(40).max(100), code: factorCodeSchema })
  .strict();
export const accountSessionSchema = z.object({
  id: idSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  current: z.boolean(),
});
export type Account = z.infer<typeof accountSchema>;
