import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { objectDraftSchema, type ObjectKind } from "@agentstack/contracts";
import type { Context } from "../db/database.service.js";
import { canEdit } from "../db/database.service.js";
import { AppError, conflict, parse, forbidden } from "../shared/errors.js";
import {
  createObject,
  patchObject,
  objectDto,
  type ObjectRow,
  referenceKinds,
} from "../objects/objects.service.js";
import { requestHash } from "../shared/crypto.util.js";
import { audit } from "../shared/audit.service.js";
const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: z.object({ name: z.string(), slug: z.string() }).optional(),
    objects: z.array(z.record(z.string(), z.unknown())).max(12000),
    files: z
      .array(
        z
          .object({
            key: z.string().max(200),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            size: z
              .number()
              .int()
              .nonnegative()
              .max(12 * 1024 * 1024),
            mimeType: z.string().max(100),
          })
          .strict(),
      )
      .max(12000)
      .default([]),
    source: z
      .object({
        commit: z.string().max(200).optional(),
        branch: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const importSchema = z
  .object({ manifest: manifestSchema, dryRun: z.boolean().default(false) })
  .strict();
export async function importManifest(
  ctx: Context,
  input: z.infer<typeof importSchema>,
) {
  canEdit(ctx);
  const manifest = input.manifest;
  if (!input.dryRun && manifest.files.length)
    throw new AppError(
      422,
      "upload_first",
      "Upload files and replace file references before importing.",
    );
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `manifest:${ctx.projectId}`,
  ]);
  const existingRows = (
    await ctx.db.query("SELECT * FROM objects WHERE project_id=$1 FOR UPDATE", [
      ctx.projectId,
    ])
  ).rows as ObjectRow[];
  const existing = new Map(existingRows.map((r) => [r.key, r]));
  const ids = new Map(existingRows.map((r) => [r.key, r.id]));
  const seen = new Set<string>(),
    pending = new Map<string, ObjectKind>();
  for (const o of manifest.objects) {
    if (typeof o.key !== "string" || typeof o.kind !== "string")
      throw new AppError(
        400,
        "invalid_manifest",
        "Every object requires key and kind.",
      );
    if (seen.has(o.key))
      throw new AppError(422, "duplicate_key", "Manifest keys must be unique.");
    seen.add(o.key);
    if (!ids.has(o.key)) ids.set(o.key, randomUUID());
    pending.set(ids.get(o.key)!, o.kind as ObjectKind);
  }
  if (new Set(manifest.files.map((f) => f.key)).size !== manifest.files.length)
    throw new AppError(
      422,
      "duplicate_file_key",
      "Manifest file keys must be unique.",
    );
  const storedFiles = manifest.files.length
    ? (
        await ctx.db.query(
          "SELECT id,sha256,size,mime_type FROM files WHERE project_id=$1 AND sha256=ANY($2::text[]) ORDER BY created_at,id",
          [ctx.projectId, manifest.files.map((f) => f.sha256)],
        )
      ).rows
    : [];
  const existingFileIds = new Map<string, string>();
  for (const file of storedFiles) {
    const key = `${file.sha256}:${file.size}:${file.mime_type}`;
    if (!existingFileIds.has(key)) existingFileIds.set(key, file.id);
  }
  const files = new Map<string, string>(),
    dryFiles = new Set<string>();
  for (const file of manifest.files) {
    const signature = `${file.sha256}:${file.size}:${file.mimeType}`;
    let id = existingFileIds.get(signature);
    if (!id) {
      const hash = createHash("sha256")
        .update(`${ctx.projectId}:${signature}`)
        .digest();
      hash[6] = (hash[6]! & 15) | 80;
      hash[8] = (hash[8]! & 63) | 128;
      const value = hash.subarray(0, 16).toString("hex");
      id = `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
      dryFiles.add(id);
    }
    files.set(file.key, id);
  }

  const normalized = manifest.objects.map((o) => {
    const copy: Record<string, unknown> & { data: Record<string, unknown> } = {
      ...o,
      data: { ...((o.data as Record<string, unknown>) ?? {}) },
    };
    const baseVersion = copy.baseVersion;
    delete copy.baseVersion;
    const archived = copy.archived;
    delete copy.archived;
    if (
      archived !== undefined &&
      (typeof archived !== "boolean" || ctx.principal.type !== "human")
    )
      throw forbidden();
    for (const key of Object.keys(referenceKinds)) {
      const v = copy.data[key];
      const resolve = (ref: unknown) => {
        if (typeof ref !== "string") return ref;
        if (z.uuid().safeParse(ref).success) return ref;
        const id = ids.get(ref.replace(/^@/, ""));
        if (!id)
          throw new AppError(
            422,
            "invalid_reference",
            `Missing reference ${ref}.`,
          );
        return id;
      };
      if (Array.isArray(v)) copy.data[key] = v.map(resolve);
      else if (v !== undefined) copy.data[key] = resolve(v);
    }
    for (const key of ["fileId", "imageFileId"]) {
      const ref = copy.data[key];
      if (typeof ref === "string" && ref.startsWith("@file:")) {
        const id = files.get(ref.slice(6));
        if (!id || !input.dryRun)
          throw new AppError(422, "invalid_file", "Unresolved file reference.");
        copy.data[key] = id;
      }
    }
    const draft = parse(objectDraftSchema, copy);
    return { draft, baseVersion, archived: archived as boolean | undefined };
  });
  // A dry run uses the same writes and constraints in a savepoint, then discards all changes.
  if (input.dryRun) await ctx.db.query("SAVEPOINT manifest_dry_run");
  const items: Array<{
    key: string;
    id: string;
    action: string;
    version: number;
  }> = [];
  let created = 0,
    updated = 0,
    unchanged = 0;
  for (const { draft, baseVersion, archived } of normalized) {
    const old = existing.get(draft.key);
    if (old) {
      if (old.kind !== draft.kind) throw conflict("Object kind is immutable.");
      const comparable = {
        key: old.key,
        kind: old.kind,
        title: old.title,
        description: old.description,
        tags: old.tags,
        visibility: old.visibility,
        status: old.status,
        data: old.data,
        archived: old.archived,
      };
      const desired = { ...draft, archived: archived ?? old.archived };
      if (requestHash(comparable) === requestHash(desired)) {
        items.push({
          key: draft.key,
          id: old.id,
          action: "unchanged",
          version: old.version,
        });
        unchanged++;
        continue;
      }
      if (baseVersion !== old.version)
        throw conflict(
          `Supply baseVersion ${old.version} for changed object ${draft.key}.`,
        );
      const r = await patchObject(
        ctx,
        old.id,
        {
          expectedVersion: old.version,
          title: draft.title,
          description: draft.description,
          tags: draft.tags,
          visibility: draft.visibility,
          status: draft.status,
          data: draft.data,
          ...(archived !== undefined ? { archived } : {}),
        },
        { pending, dryFiles: input.dryRun ? dryFiles : undefined },
      );
      items.push({
        key: r.key,
        id: r.id,
        action: "updated",
        version: r.version,
      });
      updated++;
    } else {
      if (baseVersion !== undefined)
        throw conflict(`Object ${draft.key} has no base revision.`);
      const r = await createObject(ctx, draft, {
        id: ids.get(draft.key),
        pending,
        dryFiles: input.dryRun ? dryFiles : undefined,
        archived,
      });
      items.push({
        key: r.key,
        id: r.id,
        action: "created",
        version: r.version,
      });
      created++;
    }
  }
  if (input.dryRun)
    await ctx.db.query("ROLLBACK TO SAVEPOINT manifest_dry_run");
  else
    await audit(ctx, "manifest.import", "Manifest imported", null, "team", {
      created,
      updated,
      unchanged,
      source: manifest.source ?? {},
    });
  return {
    dryRun: input.dryRun,
    created,
    updated,
    unchanged,
    items,
    source: manifest.source ?? null,
  };
}
