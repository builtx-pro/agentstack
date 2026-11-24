import { isDeepStrictEqual } from "node:util";
import type {
  ReportedImplementation,
  ScreenImplementation,
} from "@agentstack/contracts";
import type { Context } from "../db/database.service.js";
import type { ObjectRow } from "./objects.service.js";
import { AppError } from "../shared/errors.js";

export type ScreenMetadata = {
  objectVersion: number;
  designVersion: number;
  implementations: ReportedImplementation[];
};

export function screenFields(row: ObjectRow) {
  const metadata = row.screen_metadata;
  // A version written by an older app starts a conservative baseline on upgrade.
  const designVersion =
    metadata?.objectVersion === row.version
      ? metadata.designVersion
      : row.version;
  return { designVersion, implementations: metadata?.implementations ?? [] };
}

const designFields = [
  "screenId",
  "variant",
  "palette",
  "frame",
  "imageFileId",
  "previewUrl",
  "sourcePath",
  "assetIds",
  "designSourceRevision",
] as const;

export async function nextScreenMetadata(
  ctx: Context,
  old: ObjectRow,
  data: Record<string, unknown>,
  report?: ScreenImplementation,
) {
  const current = screenFields(old);
  const designChanged = designFields.some(
    (key) => !isDeepStrictEqual(old.data[key], data[key]),
  );
  const designVersion = designChanged ? old.version + 1 : current.designVersion;
  let implementations = current.implementations;
  if (report) {
    const revision = (
      await ctx.db.query(
        `SELECT COALESCE((revision.snapshot->>'designVersion')::integer, revision.version) AS design_version, EXISTS (
         SELECT 1 FROM object_revisions shared
         WHERE shared.project_id=revision.project_id AND shared.object_id=revision.object_id
           AND shared.visibility='customer'
           AND COALESCE((shared.snapshot->>'designVersion')::integer, shared.version)=revision.version
       ) AS published FROM object_revisions revision
       WHERE revision.project_id=$1 AND revision.object_id=$2 AND revision.version=$3`,
        [ctx.projectId, old.id, report.designVersion],
      )
    ).rows[0];
    if (revision?.design_version !== report.designVersion)
      throw new AppError(
        422,
        "invalid_design_version",
        "Select a design revision of this screen.",
      );
    if (old.visibility === "customer" && !revision.published)
      throw new AppError(
        422,
        "unpublished_design",
        "Select a design previously visible to customers for this shared screen.",
      );
    const entry: ReportedImplementation = {
      ...report,
      source: ctx.principal.type === "agent" ? "agent" : "human",
      actorName: ctx.principal.name,
      reportedAt: new Date().toISOString(),
      visibility: old.visibility,
    };
    implementations = [
      ...implementations.filter((item) => item.platform !== report.platform),
      entry,
    ];
  }
  return { objectVersion: old.version + 1, designVersion, implementations };
}
