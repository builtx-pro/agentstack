import { z } from "zod";

const platform = z.enum(["android", "ios", "web"]);
const designVersion = z.number().int().positive();
const codeRevision = z.string().regex(/^[a-fA-F0-9]{7,64}$/);
const evidenceUrl = z
  .url({ protocol: /^https$/ })
  .max(2048)
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return !url.username && !url.password;
  }, "Use a shareable HTTPS evidence URL without credentials");

const designOnly = z
  .object({ platform, designVersion, state: z.literal("design_only") })
  .strict();
const buildReport = z
  .object({
    platform,
    designVersion,
    state: z.enum(["implemented", "partial", "app_changed"]),
    build: z.string().trim().min(1).max(120),
    commit: codeRevision.optional(),
    evidenceUrl,
  })
  .strict();
export const screenImplementationSchema = z.discriminatedUnion("state", [
  designOnly,
  buildReport,
]);
const attribution = {
  source: z.enum(["agent", "human"]),
  actorName: z.string(),
  reportedAt: z.string(),
  visibility: z.enum(["customer", "team"]),
};
export const reportedImplementationSchema = z.discriminatedUnion("state", [
  designOnly.extend(attribution),
  buildReport.extend(attribution),
]);
export type ScreenImplementation = z.infer<typeof screenImplementationSchema>;
export type ReportedImplementation = z.infer<
  typeof reportedImplementationSchema
>;
