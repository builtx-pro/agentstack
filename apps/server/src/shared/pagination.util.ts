import { z } from "zod";
import { AppError } from "./errors.js";
export function decodeCursor(cursor?: string): string | null {
  if (!cursor) return null;
  try {
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    return z.uuid().parse(id);
  } catch {
    throw new AppError(400, "invalid_cursor", "Invalid pagination cursor.");
  }
}
export function page<T extends { id: string }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: more
      ? Buffer.from(items.at(-1)!.id).toString("base64url")
      : null,
  };
}
