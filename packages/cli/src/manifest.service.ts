import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import {
  manifestSchema,
  type Manifest,
  type ProjectObject,
} from "@agentstack/sdk";

export interface PreparedFile {
  key: string;
  absolutePath: string;
  name: string;
  mimeType: string;
  sha256: string;
  size: number;
}
export async function readJsonFile(
  path: string,
  maxBytes = 32 * 1024 * 1024,
): Promise<unknown> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error("Input must be a regular file within the size limit.");
    return JSON.parse(await handle.readFile("utf8")) as unknown;
  } finally {
    await handle.close();
  }
}
export async function readVerifiedFile(file: PreparedFile): Promise<Buffer> {
  const handle = await open(
    file.absolutePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size !== file.size)
      throw new Error(`File size changed: ${file.key}`);
    const bytes = await handle.readFile();
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256)
      throw new Error(`File hash mismatch: ${file.key}`);
    return bytes;
  } finally {
    await handle.close();
  }
}
export async function validateManifestFiles(
  input: Manifest,
  directory: string,
  maxTotalBytes = 2 * 1024 ** 3,
): Promise<PreparedFile[]> {
  const manifest = manifestSchema.parse(input);
  const root = await realpath(directory);
  const prepared: PreparedFile[] = [];
  const keys = new Set<string>();
  let total = 0;
  for (const file of manifest.files) {
    if (
      !file.path ||
      isAbsolute(file.path) ||
      file.path.split(/[\\/]/).includes("..") ||
      file.path.includes("\\")
    )
      throw new Error(`Unsafe or missing relative file path: ${file.key}`);
    if (keys.has(file.key)) throw new Error(`Duplicate file key: ${file.key}`);
    keys.add(file.key);
    let current = root;
    for (const segment of file.path.split("/")) {
      if (!segment || segment === ".")
        throw new Error(`Invalid file path: ${file.key}`);
      current = resolve(current, segment);
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Symlinks are not allowed: ${file.key}`);
    }
    const absolutePath = await realpath(current);
    const rel = relative(root, absolutePath);
    if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel))
      throw new Error(`File escaped the manifest directory: ${file.key}`);
    total += file.size;
    if (total > maxTotalBytes)
      throw new Error("Manifest files exceed the configured total byte limit.");
    const record = {
      key: file.key,
      absolutePath,
      name: basename(absolutePath),
      mimeType: file.mimeType,
      sha256: file.sha256,
      size: file.size,
    };
    await readVerifiedFile(record);
    prepared.push(record);
  }
  return prepared;
}
export function remapManifestFiles(
  manifest: Manifest,
  uploaded: ReadonlyMap<string, string>,
): Manifest {
  return {
    ...manifest,
    files: [],
    objects: manifest.objects.map((object) => {
      const data = { ...object.data };
      for (const field of ["imageFileId", "fileId"]) {
        const value = data[field];
        if (typeof value === "string" && value.startsWith("@file:")) {
          const key = value.slice(6);
          const id = uploaded.get(key);
          if (!id) throw new Error(`Missing uploaded file reference: ${key}`);
          data[field] = id;
        }
      }
      return { ...object, data };
    }),
  };
}
export function exportObjects(objects: ProjectObject[]): Manifest["objects"] {
  const keys = new Map(objects.map((item) => [item.id, item.key]));
  return objects.map((item) => {
    const data = { ...item.data };
    for (const field of ["epicId", "waveId", "sprintId", "linkedStoryId"]) {
      const value = data[field];
      if (typeof value === "string" && keys.has(value))
        data[field] = `@${keys.get(value)}`;
    }
    for (const field of ["assetIds", "screenIds", "featureIds"]) {
      const value = data[field];
      if (Array.isArray(value))
        data[field] = value.map((id) =>
          typeof id === "string" && keys.has(id) ? `@${keys.get(id)}` : id,
        );
    }
    return {
      key: item.key,
      kind: item.kind,
      title: item.title,
      description: item.description,
      tags: item.tags,
      visibility: item.visibility,
      status: item.status,
      data,
      baseVersion: item.version,
    };
  });
}
