import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  validateManifestFiles,
  remapManifestFiles,
} from "./manifest.service.js";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.map((path) => rm(path, { recursive: true, force: true })),
  );
  roots.length = 0;
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "agentstack-cli-"));
  roots.push(root);
  const body = Buffer.from("synthetic");
  await writeFile(join(root, "image.png"), body);
  return {
    root,
    body,
    manifest: {
      schemaVersion: 1 as const,
      objects: [],
      files: [
        {
          key: "image",
          path: "image.png",
          sha256: createHash("sha256").update(body).digest("hex"),
          size: body.length,
          mimeType: "image/png" as const,
        },
      ],
    },
  };
}
describe("manifest file preparation", () => {
  it("checks each declared hash and size before any upload", async () => {
    const { root, manifest } = await setup();
    expect(await validateManifestFiles(manifest, root)).toHaveLength(1);
    manifest.files[0]!.sha256 = "0".repeat(64);
    await expect(validateManifestFiles(manifest, root)).rejects.toThrow("hash");
  });
  it("rejects traversal, absolute paths and symlinks", async () => {
    const { root, manifest } = await setup();
    await mkdir(join(root, "files"));
    await symlink(join(root, "image.png"), join(root, "files", "link.png"));
    for (const path of ["../image.png", "/etc/passwd", "files/link.png"]) {
      manifest.files[0]!.path = path;
      await expect(validateManifestFiles(manifest, root)).rejects.toThrow();
    }
  });
  it("fails a dangling file reference and does not guess identifiers", () => {
    const { manifest } = {
      manifest: {
        schemaVersion: 1 as const,
        files: [],
        objects: [
          {
            key: "home",
            kind: "screen" as const,
            title: "Home",
            data: { imageFileId: "@file:missing" },
          },
        ],
      },
    };
    expect(() => remapManifestFiles(manifest, new Map())).toThrow("missing");
  });
});
