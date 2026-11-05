import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const missing = () =>
  new AppError(404, "not_found", "The requested resource is unavailable.");
export const forbidden = () =>
  new AppError(403, "forbidden", "This action is not permitted.");
export const conflict = (
  message = "This item changed. Reload its current version before retrying.",
) => new AppError(409, "version_conflict", message);
export function parse<T>(
  schema: { parse: (value: unknown) => T },
  value: unknown,
): T {
  try {
    return schema.parse(value);
  } catch (e) {
    if (e instanceof ZodError)
      throw new AppError(
        400,
        "invalid_input",
        e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    throw e;
  }
}
