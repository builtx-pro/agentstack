import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import type { Context } from "../db/database.service.js";
import { canEdit } from "../db/database.service.js";
import { AppError, missing } from "../shared/errors.js";
import { audit } from "../shared/audit.service.js";
const allowed = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
export async function storeFile(
  ctx: Context,
  storage: string,
  name: string,
  bytes: Buffer,
) {
  canEdit(ctx);
  if (bytes.length > 12 * 1024 * 1024)
    throw new AppError(413, "file_too_large", "Images may be at most 12 MiB.");
  const detected = await fileTypeFromBuffer(bytes);
  let mime = detected?.mime;
  if (!mime) {
    const text = bytes.toString("utf8");
    if (
      /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)
    ) {
      // SVG is never inserted into DOM; active constructs are also rejected at ingress.
      if (
        /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|webp);base64,)[^"']|url\(\s*["']?(?!#)/i.test(
          text,
        )
      )
        throw new AppError(
          422,
          "unsafe_svg",
          "Use a static SVG without scripts, event handlers or external resources.",
        );
      mime = "image/svg+xml";
    }
  }
  if (!mime || (!allowed.has(mime) && mime !== "image/svg+xml"))
    throw new AppError(
      415,
      "unsupported_file",
      "Upload PNG, JPEG, WebP, GIF, AVIF or a static SVG.",
    );
  const id = randomUUID(),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `file:${ctx.projectId}:${sha256}:${bytes.length}:${mime}`,
  ]);
  const existing = (
    await ctx.db.query(
      "SELECT * FROM files WHERE project_id=$1 AND sha256=$2 AND size=$3 AND mime_type=$4 ORDER BY created_at,id LIMIT 1",
      [ctx.projectId, sha256, bytes.length, mime],
    )
  ).rows[0];
  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      mimeType: existing.mime_type,
      size: existing.size,
      sha256: existing.sha256,
      url: `/api/v1/projects/${ctx.projectId}/files/${existing.id}`,
    };
  }
  const safeName =
    name.replace(/[\r\n\x00-\x1f/\\]/g, "_").slice(0, 200) || "image";
  await mkdir(join(storage, ctx.projectId), { recursive: true, mode: 0o700 });
  const path = join(storage, ctx.projectId, id);
  let created = false;
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    created = true;
    await ctx.db.query(
      "INSERT INTO files(id,project_id,name,mime_type,size,sha256,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        id,
        ctx.projectId,
        safeName,
        mime,
        bytes.length,
        sha256,
        ctx.principal.id,
      ],
    );
    await audit(ctx, "file.upload", "Visual file uploaded", null, "team", {
      id,
      mimeType: mime,
      size: bytes.length,
    });
  } catch (e) {
    // A failed write can leave partial bytes. Never unlink a pre-existing exclusive-create collision.
    const collision = e instanceof Error && 'code' in e && e.code === 'EEXIST';
    if (created || !collision) await unlink(path).catch(() => undefined);
    throw e;
  }
  return {
    id,
    name: safeName,
    mimeType: mime,
    size: bytes.length,
    sha256,
    url: `/api/v1/projects/${ctx.projectId}/files/${id}`,
  };
}
export async function loadFile(ctx: Context, storage: string, id: string) {
  const row = (
    await ctx.db.query(
      "SELECT f.* FROM files f WHERE f.project_id=$1 AND f.id=$2 AND ($3=false OR EXISTS(SELECT 1 FROM object_files ofl JOIN objects o ON o.id=ofl.object_id AND o.project_id=ofl.project_id WHERE ofl.project_id=f.project_id AND ofl.file_id=f.id AND ofl.visibility='customer' AND o.visibility='customer' AND o.kind<>'rule'))",
      [ctx.projectId, id, ctx.role === "customer"],
    )
  ).rows[0];
  if (!row) throw missing();
  try {
    return {
      bytes: await readFile(join(storage, ctx.projectId, id)),
      mimeType: row.mime_type as string,
      name: row.name as string,
    };
  } catch {
    throw new AppError(
      503,
      "file_unavailable",
      "This file is temporarily unavailable.",
    );
  }
}
