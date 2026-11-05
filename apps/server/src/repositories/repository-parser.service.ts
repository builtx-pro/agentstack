import { createHash } from "node:crypto";
import { parseDocument } from "yaml";
import {
  objectDraftSchema,
  repositoryRootSchema,
  type RepositoryDraft,
  type RepositorySnapshotInput,
} from "@agentstack/contracts";
import { AppError } from "../shared/errors.js";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const repositoryPathAllowed = (path: string, roots: string[]) =>
  repositoryRootSchema.safeParse(path).success &&
  path.toLowerCase().endsWith(".md") &&
  roots.some((root) => path === root || path.startsWith(root + "/"));
const fail = (message: string): never => {
  throw new AppError(422, "repository_parse_error", message);
};
function metadata(text: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n"))
    return { meta: {}, body: text };
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) fail("Unclosed Markdown frontmatter");
  try {
    const doc = parseDocument(match![1]!, { uniqueKeys: true });
    if (doc.errors.length) fail("Invalid YAML frontmatter");
    const meta = doc.toJS({ maxAliasCount: 0 });
    if (!meta || typeof meta !== "object" || Array.isArray(meta))
      fail("Frontmatter must be a mapping");
    return { meta: meta as Record<string, unknown>, body: match![2]! };
  } catch {
    return fail("Invalid YAML frontmatter or unsupported aliases");
  }
}
function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function status(value: unknown) {
  const normalized = text(value, "backlog").replace(/-/g, "_");
  if (normalized === "blocked") return "in_progress";
  if (
    !["backlog", "ready", "in_progress", "review", "done"].includes(normalized)
  )
    fail("Unsupported work item status");
  return normalized;
}
function kindFor(meta: Record<string, unknown>, path: string) {
  const explicit = text(meta.kind);
  if (explicit) {
    if (
      ![
        "document",
        "rule",
        "wave",
        "epic",
        "story",
        "sprint",
        "feature",
      ].includes(explicit)
    )
      fail("Unsupported repository object kind");
    return explicit;
  }
  const id = text(meta.id).toUpperCase();
  for (const kind of ["wave", "epic", "story", "sprint", "feature"])
    if (id.startsWith(kind.toUpperCase() + "-")) return kind;
  if (/(^|\/)(AGENTS|CLAUDE)\.md$/i.test(path) || /(^|\/)rules\//.test(path))
    return "rule";
  return "document";
}
export function parseRepositoryFiles(
  connectionId: string,
  roots: string[],
  files: RepositorySnapshotInput["files"],
): RepositoryDraft[] {
  if (files.length > 200)
    fail("At most 200 Markdown files can be synchronized");
  let bytes = 0;
  const paths = new Set<string>(),
    keys = new Set<string>(),
    drafts: RepositoryDraft[] = [],
    waveRefs = new Map<string, { path: string; title: string }>();
  const ref = (key: string) => `repo:${connectionId}:${key}`;
  const add = (key: string, path: string, raw: unknown) => {
    if (keys.has(key)) fail("Duplicate repository source identifier");
    keys.add(key);
    const parsed = objectDraftSchema.safeParse(raw);
    if (!parsed.success)
      fail("A repository document does not match the project object contract");
    drafts.push({ key, path, hash: hash(parsed.data), draft: parsed.data! });
  };
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!repositoryPathAllowed(file.path, roots) || paths.has(file.path))
      fail("Invalid, duplicate or out-of-scope repository path");
    paths.add(file.path);
    const length = Buffer.byteLength(file.content);
    bytes += length;
    if (length > 131072 || bytes > 4 * 1024 * 1024)
      fail("Repository content exceeds the import size limit");
    const { meta, body } = metadata(file.content),
      kind = kindFor(meta, file.path),
      key = text(meta.id) || `path-${hash(file.path).slice(0, 32)}`;
    const title =
      text(meta.title) ||
      body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
      file.path.split("/").at(-1)!.replace(/\.md$/i, "");
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    if (tags.some((v) => typeof v !== "string"))
      fail("Repository tags must be strings");
    const common = {
      key: ref(key),
      kind,
      title,
      description: text(
        meta.description,
        body.replace(/^#.*$/m, "").trim().slice(0, 8000),
      ),
      tags: [...new Set([...tags, "repository"])],
      visibility: kind === "rule" ? "team" : text(meta.visibility, "team"),
      status:
        ["document", "rule"].includes(kind) &&
        ![
          "backlog",
          "ready",
          "in_progress",
          "in-progress",
          "review",
          "done",
          "blocked",
        ].includes(text(meta.status, "backlog"))
          ? "backlog"
          : status(meta.status),
    };
    const data: Record<string, unknown> = {};
    if (kind === "document" || kind === "rule") data.markdown = body;
    if (kind === "epic") {
      const wave = text(meta.wave) || text(meta.milestone);
      if (wave) {
        const waveKey =
          text(meta.wave) ||
          `wave:${/^[\p{L}\p{N}_:.\/-]{1,120}$/u.test(wave) ? wave : hash(wave).slice(0, 32)}`;
        data.waveId = ref(waveKey);
        if (!text(meta.wave))
          waveRefs.set(waveKey, { path: file.path, title: wave });
      }
    }
    if (kind === "sprint") {
      for (const field of ["goal", "startDate", "endDate"])
        if (meta[field] !== undefined) data[field] = meta[field];
    }
    if (kind === "story") {
      for (const [field, source] of [
        ["epicId", "epic"],
        ["sprintId", "sprint"],
      ] as const) {
        const value = text(meta[field]) || text(meta[source]);
        if (value) data[field] = ref(value);
      }
      if (Array.isArray(meta.featureIds))
        data.featureIds = meta.featureIds.map((v) => ref(String(v)));
      data.blocked = meta.blocked === true || meta.status === "blocked";
      const priority = text(meta.priority, "normal");
      data.priority =
        (
          {
            must: "high",
            should: "normal",
            could: "low",
            wont: "low",
          } as Record<string, string>
        )[priority] ?? priority;
      data.checklist = [
        ...body.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/gm),
      ].map((m, index) => ({
        id: hash(`${m[2]}:${index}`).slice(0, 20),
        text: m[2]!.trim(),
        done: m[1]!.toLowerCase() === "x",
      }));
    }
    add(key, file.path, { ...common, data });
    if (!["document", "rule"].includes(kind))
      add(key + ":document", file.path, {
        ...common,
        key: ref(key + ":document"),
        kind: "document",
        title: (title + " · source").slice(0, 240),
        tags: [...common.tags, "source-document"],
        data: { markdown: body },
      });
  }
  for (const [key, { path, title }] of waveRefs)
    if (!keys.has(key))
      add(key, path, {
        key: ref(key),
        kind: "wave",
        title,
        description: "Imported repository milestone",
        tags: ["repository"],
        visibility: "team",
        status: "backlog",
        data: {},
      });
  return drafts;
}
