import { randomUUID } from "node:crypto";
import type {
  Repository,
  RepositoryCreate,
  RepositoryPatch,
  RepositorySnapshotInput,
  RepositoryApply,
  RepositoryDraft,
} from "@agentstack/contracts";
import { type Context, canEdit, human } from "../db/database.service.js";
import { AppError, missing, forbidden, conflict } from "../shared/errors.js";
import { audit } from "../shared/audit.service.js";
import { requestHash } from "../shared/crypto.util.js";
import { importManifest } from "../imports/import.service.js";
import { objectDto, type ObjectRow } from "../objects/objects.service.js";
import { parseRepositoryFiles } from "./repository-parser.service.js";
import { RepositoryCredentialVault } from "./credential-vault.service.js";
import { validateRepository } from "./repository-provider.service.js";
const date = (v: any) => (v instanceof Date ? v.toISOString() : v);
export function repositoryDto(r: any): Repository {
  return {
    id: r.id,
    projectId: r.project_id,
    provider: r.provider,
    repository: r.repository,
    branch: r.branch,
    label: r.label,
    roots: r.roots,
    version: r.version,
    archived: r.archived,
    hasCredential: !!r.credential_ciphertext,
    sharePipelines: r.share_pipelines,
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  };
}
function configure(ctx: Context) {
  human(ctx);
  if (ctx.role !== "admin") throw forbidden();
}
export async function getRepository(ctx: Context, id: string, lock = false) {
  canEdit(ctx);
  const r = (
    await ctx.db.query(
      `SELECT * FROM repository_connections WHERE project_id=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
      [ctx.projectId, id],
    )
  ).rows[0];
  if (!r) throw missing();
  return r;
}
export async function listRepositories(ctx: Context) {
  canEdit(ctx);
  return {
    items: (
      await ctx.db.query(
        "SELECT * FROM repository_connections WHERE project_id=$1 ORDER BY created_at,id",
        [ctx.projectId],
      )
    ).rows.map(repositoryDto),
    nextCursor: null,
  };
}
export async function createRepository(
  ctx: Context,
  input: RepositoryCreate,
  vault: RepositoryCredentialVault,
) {
  configure(ctx);
  validateRepository(input.provider, input.repository);
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `repository-config:${ctx.projectId}`,
  ]);
  const count = (
    await ctx.db.query(
      "SELECT count(*)::integer AS n FROM repository_connections WHERE project_id=$1",
      [ctx.projectId],
    )
  ).rows[0].n;
  if (count >= 20)
    throw new AppError(
      422,
      "repository_limit",
      "At most 20 repository connections are supported per project.",
    );
  if (input.provider === "local" && input.token)
    throw new AppError(
      400,
      "invalid_repository",
      "Local connections do not use provider credentials.",
    );
  const id = randomUUID(),
    cipher = input.token ? vault.encrypt(input.token, ctx.projectId, id) : null;
  const r = (
    await ctx.db.query(
      "INSERT INTO repository_connections(id,project_id,provider,repository,branch,label,roots,share_pipelines,credential_ciphertext,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
      [
        id,
        ctx.projectId,
        input.provider,
        input.repository,
        input.branch,
        input.label,
        input.roots,
        input.sharePipelines,
        cipher,
        ctx.principal.id,
      ],
    )
  ).rows[0];
  await audit(
    ctx,
    "repository.created",
    "Repository connection created",
    id,
    "team",
    { connection: repositoryDto(r) },
  );
  return repositoryDto(r);
}
export async function patchRepository(
  ctx: Context,
  id: string,
  input: RepositoryPatch,
  vault: RepositoryCredentialVault,
) {
  configure(ctx);
  const old = await getRepository(ctx, id, true);
  if (old.version !== input.expectedVersion) throw conflict();
  if (old.provider === "local" && input.token)
    throw new AppError(
      400,
      "invalid_repository",
      "Local connections do not use provider credentials.",
    );
  const cipher =
    input.token === undefined
      ? old.credential_ciphertext
      : input.token === null
        ? null
        : vault.encrypt(input.token, ctx.projectId, id);
  const r = (
    await ctx.db.query(
      "UPDATE repository_connections SET label=$3,branch=$4,roots=$5,share_pipelines=$6,archived=$7,credential_ciphertext=$8,version=version+1,updated_at=now() WHERE project_id=$1 AND id=$2 RETURNING *",
      [
        ctx.projectId,
        id,
        input.label ?? old.label,
        input.branch ?? old.branch,
        input.roots ?? old.roots,
        input.sharePipelines ?? old.share_pipelines,
        input.archived ?? old.archived,
        cipher,
      ],
    )
  ).rows[0];
  await audit(
    ctx,
    "repository.updated",
    "Repository connection updated",
    id,
    "team",
    {
      previous: repositoryDto(old),
      connection: repositoryDto(r),
      credentialChanged: input.token !== undefined,
    },
  );
  return repositoryDto(r);
}
const objectHash = (r: any) =>
  requestHash({
    key: r.key,
    kind: r.kind,
    title: r.title,
    description: r.description,
    tags: r.tags,
    visibility: r.visibility,
    status: r.status,
    data: r.data,
    archived: r.archived,
  });
function summary(r: any) {
  return {
    id: r.id,
    connectionId: r.connection_id,
    projectId: r.project_id,
    branch: r.branch,
    commit: r.commit_sha,
    source: r.source,
    createdAt: date(r.created_at),
    pipelines: r.pipelines,
    entryCount: r.entry_count ?? r.drafts.length,
  };
}
async function snapshotRow(ctx: Context, id: string, sid: string) {
  const r = (
    await ctx.db.query(
      "SELECT * FROM repository_snapshots WHERE project_id=$1 AND connection_id=$2 AND id=$3",
      [ctx.projectId, id, sid],
    )
  ).rows[0];
  if (!r) throw missing();
  return r;
}
export async function snapshotDetail(ctx: Context, row: any) {
  const bindings = (
    await ctx.db.query(
      "SELECT b.*,json_build_object('id',o.id,'key',o.key,'kind',o.kind,'title',o.title,'version',o.version) AS object FROM repository_bindings b JOIN objects o ON o.project_id=b.project_id AND o.id=b.object_id WHERE b.project_id=$1 AND b.connection_id=$2",
      [ctx.projectId, row.connection_id],
    )
  ).rows;
  const objects = (
    await ctx.db.query(
      "SELECT id,key,kind,title,version FROM objects WHERE project_id=$1 AND key=ANY($2::text[])",
      [ctx.projectId, row.drafts.map((d: RepositoryDraft) => d.draft.key)],
    )
  ).rows;
  const bound = new Map(bindings.map((b) => [b.source_key, b])),
    byKey = new Map(objects.map((o) => [o.key, o])),
    seen = new Set<string>();
  const entries = row.drafts.map((d: RepositoryDraft) => {
    seen.add(d.key);
    const b = bound.get(d.key),
      current = b?.object ?? byKey.get(d.draft.key);
    let state = "new",
      reason: string | undefined;
    if (current) {
      if (!b) {
        state = "conflict";
        reason =
          "An existing object has this key but has not been linked to this repository.";
      } else if (d.hash === b.source_hash && d.path === b.source_path) {
        state = "unchanged";
        reason =
          current.version !== b.object_version
            ? "Repository source is unchanged; web edits are preserved."
            : undefined;
      } else if (current.version !== b.object_version) {
        state = "conflict";
        reason = "Both the repository source and the project object changed.";
      } else state = "changed";
    }
    return {
      key: d.key,
      path: d.path,
      kind: d.draft.kind,
      title: d.draft.title,
      state,
      currentVersion: current?.version ?? null,
      draft: d.draft,
      ...(reason ? { reason } : {}),
    };
  });
  for (const b of bindings)
    if (!seen.has(b.source_key))
      entries.push({
        key: b.source_key,
        path: b.source_path,
        kind: b.object.kind,
        title: b.object.title,
        state: "missing",
        currentVersion: b.object.version,
        draft: null,
        reason:
          "No source entry in this snapshot. The project object is retained.",
      });
  const counts = { new: 0, changed: 0, unchanged: 0, conflict: 0, missing: 0 };
  for (const e of entries) counts[e.state as keyof typeof counts]++;
  const detail = { ...summary(row), entries, counts };
  if (Buffer.byteLength(JSON.stringify(detail)) > 4 * 1024 * 1024 - 65536)
    throw new AppError(
      413,
      "repository_snapshot_too_large",
      "The changeset exceeds the response limit. Narrow repository roots and retry.",
    );
  return detail;
}
export async function getSnapshot(ctx: Context, id: string, sid: string) {
  await getRepository(ctx, id);
  return snapshotDetail(ctx, await snapshotRow(ctx, id, sid));
}
export async function listSnapshots(ctx: Context, id: string) {
  await getRepository(ctx, id);
  return {
    items: (
      await ctx.db.query(
        "SELECT id,project_id,connection_id,branch,commit_sha,source,created_at,pipelines,jsonb_array_length(drafts) AS entry_count FROM repository_snapshots WHERE project_id=$1 AND connection_id=$2 ORDER BY created_at DESC,id DESC LIMIT 30",
        [ctx.projectId, id],
      )
    ).rows.map(summary),
    nextCursor: null,
  };
}
export async function stageSnapshot(
  ctx: Context,
  id: string,
  input: RepositorySnapshotInput,
  source: "provider" | "reported",
) {
  canEdit(ctx);
  const connection = await getRepository(ctx, id, true);
  if (connection.version !== input.expectedVersion) throw conflict();
  if (connection.archived) throw conflict("This connection is archived.");
  if (input.branch !== connection.branch)
    throw conflict("Snapshot branch must match the configured branch.");
  const drafts = parseRepositoryFiles(id, connection.roots, input.files),
    pipelines = input.pipelines.map((p) => ({ ...p, source }));
  const row = {
    id: randomUUID(),
    project_id: ctx.projectId,
    connection_id: id,
    config_version: connection.version,
    branch: input.branch,
    commit_sha: input.commit,
    source,
    drafts,
    pipelines,
    created_at: new Date(),
  };
  const latest = (
    await ctx.db.query(
      "SELECT * FROM repository_snapshots WHERE project_id=$1 AND connection_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1",
      [ctx.projectId, id],
    )
  ).rows[0];
  if (
    latest &&
    latest.config_version === connection.version &&
    latest.commit_sha === input.commit &&
    latest.source === source &&
    requestHash({ drafts: latest.drafts, pipelines: latest.pipelines }) ===
      requestHash({ drafts, pipelines })
  )
    return snapshotDetail(ctx, latest);
  const detail = await snapshotDetail(ctx, row);
  if (Buffer.byteLength(JSON.stringify(detail)) > 4 * 1024 * 1024 - 65536)
    throw new AppError(
      413,
      "repository_snapshot_too_large",
      "The changeset exceeds the response limit. Narrow repository roots and retry.",
    );
  await ctx.db.query(
    "INSERT INTO repository_snapshots(id,project_id,connection_id,config_version,branch,commit_sha,source,drafts,pipelines,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      row.id,
      ctx.projectId,
      id,
      connection.version,
      input.branch,
      input.commit,
      source,
      JSON.stringify(drafts),
      JSON.stringify(pipelines),
      ctx.principal.id,
    ],
  );
  await audit(
    ctx,
    "repository.staged",
    "Repository changes staged for human review",
    id,
    "team",
    { snapshotId: row.id, source, entries: drafts.length },
  );
  return detail;
}
export async function applySnapshot(
  ctx: Context,
  id: string,
  sid: string,
  input: RepositoryApply,
) {
  human(ctx);
  canEdit(ctx);
  const connection = await getRepository(ctx, id, true);
  if (connection.version !== input.expectedVersion || connection.archived)
    throw conflict();
  const row = await snapshotRow(ctx, id, sid);
  if (row.config_version !== connection.version)
    throw conflict("Connection settings changed. Stage a fresh snapshot.");
  await ctx.db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    `manifest:${ctx.projectId}`,
  ]);
  await ctx.db.query("SELECT id FROM objects WHERE project_id=$1 FOR UPDATE", [
    ctx.projectId,
  ]);
  const detail = await snapshotDetail(ctx, row),
    lookup = new Map<string, any>(detail.entries.map((e: any) => [e.key, e])),
    drafts = new Map<string, RepositoryDraft>(
      row.drafts.map((d: RepositoryDraft) => [d.key, d]),
    );
  const seen = new Set<string>(),
    selected: RepositoryDraft[] = [],
    objects = [];
  for (const choice of input.entries) {
    if (seen.has(choice.key))
      throw new AppError(400, "duplicate_key", "Apply entries must be unique.");
    seen.add(choice.key);
    const entry = lookup.get(choice.key);
    if (!entry || !entry.draft)
      throw new AppError(
        422,
        "invalid_repository_entry",
        "Missing source entries cannot be applied.",
      );
    if (entry.currentVersion !== choice.expectedObjectVersion) throw conflict();
    if (entry.state === "conflict" && !choice.resolveConflict)
      throw conflict("Explicitly resolve this conflict before applying.");
    if (entry.state !== "unchanged") {
      selected.push(drafts.get(choice.key)!);
      objects.push({
        ...entry.draft,
        ...(entry.currentVersion === null
          ? {}
          : { baseVersion: entry.currentVersion }),
      });
    }
  }
  const result = await importManifest(ctx, {
    dryRun: false,
    manifest: {
      schemaVersion: 1,
      objects,
      files: [],
      source: { commit: row.commit_sha, branch: row.branch },
    },
  });
  const output = [];
  for (const d of selected) {
    const object = (
      await ctx.db.query(
        "SELECT * FROM objects WHERE project_id=$1 AND key=$2",
        [ctx.projectId, d.draft.key],
      )
    ).rows[0] as ObjectRow;
    await ctx.db.query(
      "INSERT INTO repository_bindings(project_id,connection_id,source_key,source_path,object_id,source_hash,object_hash,object_version,commit_sha,snapshot_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(project_id,connection_id,source_key) DO UPDATE SET source_path=EXCLUDED.source_path,source_hash=EXCLUDED.source_hash,object_hash=EXCLUDED.object_hash,object_version=EXCLUDED.object_version,commit_sha=EXCLUDED.commit_sha,snapshot_id=EXCLUDED.snapshot_id",
      [
        ctx.projectId,
        id,
        d.key,
        d.path,
        object.id,
        d.hash,
        objectHash(object),
        object.version,
        row.commit_sha,
        sid,
      ],
    );
    output.push(objectDto(object));
  }
  await audit(
    ctx,
    "repository.applied",
    "Reviewed repository changes applied",
    id,
    "team",
    { snapshotId: sid, applied: result.created + result.updated },
  );
  return {
    applied: result.created + result.updated,
    unchanged: input.entries.length - selected.length + result.unchanged,
    objects: output,
    snapshotId: sid,
  };
}
export async function repositoryPipelines(ctx: Context) {
  const rows = (
    await ctx.db.query(
      "SELECT c.id,c.label,c.provider,s.created_at,s.pipelines FROM repository_connections c LEFT JOIN LATERAL(SELECT created_at,pipelines FROM repository_snapshots WHERE project_id=c.project_id AND connection_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1)s ON true WHERE c.project_id=$1 AND NOT c.archived AND ($2::boolean=false OR c.share_pipelines) ORDER BY c.created_at,c.id",
      [ctx.projectId, ctx.role === "customer"],
    )
  ).rows;
  return {
    items: rows.map((r) => ({
      connectionId: r.id,
      label: r.label,
      provider: r.provider,
      lastCheckedAt: r.created_at ? date(r.created_at) : null,
      pipelines: (r.pipelines ?? []).map((p: any) =>
        ctx.role === "customer"
          ? {
              id: p.id,
              name: p.name,
              status: p.status,
              updatedAt: p.updatedAt,
              source: p.source,
            }
          : p,
      ),
    })),
    nextCursor: null,
  };
}
export async function repositoryBindings(ctx: Context, objectId: string) {
  canEdit(ctx);
  const rows = (
    await ctx.db.query(
      "SELECT b.object_id,b.connection_id,b.source_path,b.commit_sha,b.source_hash,b.object_version,c.provider,c.repository,c.label FROM repository_bindings b JOIN repository_connections c ON c.project_id=b.project_id AND c.id=b.connection_id WHERE b.project_id=$1 AND b.object_id=$2",
      [ctx.projectId, objectId],
    )
  ).rows;
  return {
    items: rows.map((r) => ({
      objectId: r.object_id,
      connectionId: r.connection_id,
      label: r.label,
      path: r.source_path,
      commit: r.commit_sha,
      sourceHash: r.source_hash,
      lastAppliedVersion: r.object_version,
      ...(r.provider === "local"
        ? {}
        : {
            sourceUrl: `https://${r.provider === "github" ? "github.com" : "gitlab.com"}/${r.repository.split("/").map(encodeURIComponent).join("/")}/${r.provider === "github" ? "blob" : "-/blob"}/${encodeURIComponent(r.commit_sha)}/${r.source_path.split("/").map(encodeURIComponent).join("/")}`,
          }),
    })),
    nextCursor: null,
  };
}
