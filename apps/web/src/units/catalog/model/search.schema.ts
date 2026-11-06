import { z } from "zod";
export const searchSchema = z.object({
  mode: z.enum(["flows", "grid"]).catch("flows").optional(),
  frame: z.enum(["", "mobile", "desktop"]).catch("").optional(),
  q: z.string().catch(""),
  tag: z.string().catch(""),
  variant: z.string().catch(""),
  palette: z.string().catch(""),
  flow: z.string().catch(""),
  status: z.string().catch(""),
  kind: z.string().catch(""),
  archived: z.boolean().catch(false),
  selected: z.string().catch(""),
});
export type CatalogFilters = z.infer<typeof searchSchema>;
