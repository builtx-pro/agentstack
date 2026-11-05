import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  access,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRepositorySource } from "./repository-source.service.js";
let directory: string;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "agentstack-repository-"));
  git("init", "-b", "main");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  await mkdir(join(directory, "docs"));
  await writeFile(join(directory, "docs/guide.md"), "# Committed guide\n");
  await writeFile(join(directory, "private.txt"), "Never include");
  git("add", ".");
  git("commit", "-m", "Fixture");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe("committed repository source", () => {
  it("reads committed objects, never dirty or untracked content", async () => {
    await writeFile(join(directory, "docs/guide.md"), "DIRTY PRIVATE VALUE");
    await writeFile(join(directory, "docs/untracked.md"), "UNTRACKED");
    const result = await readRepositorySource(directory, ["docs"], "main");
    expect(result.commit).toBe(git("rev-parse", "HEAD"));
    expect(result.files).toEqual([
      { path: "docs/guide.md", content: "# Committed guide\n" },
    ]);
  });
  it("never fetches missing promisor blobs or invokes repository SSH helpers", async () => {
    const blob = git("rev-parse", "HEAD:docs/guide.md");
    const helper = join(directory, "ssh-helper");
    const attempted = join(directory, "lazy-fetch-attempt");
    await writeFile(
      helper,
      '#!/bin/sh\n: > "$(dirname "$0")/lazy-fetch-attempt"\nexit 1\n',
      { mode: 0o700 },
    );
    git("config", "extensions.partialClone", "origin");
    git("config", "remote.origin.promisor", "true");
    git("config", "remote.origin.url", "ssh://example.invalid/repository");
    git("config", "core.sshCommand", helper);
    await rm(join(directory, ".git/objects", blob.slice(0, 2), blob.slice(2)));
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow();
    await expect(access(attempted)).rejects.toThrow();
  });
  it("rejects a configured branch mismatch before staging", async () => {
    await expect(
      readRepositorySource(directory, ["docs"], "release"),
    ).rejects.toThrow("branch");
  });
  it("allows detached CI only when its exact local branch points at HEAD", async () => {
    git("checkout", "--detach");
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow("Detached");
    const result = await readRepositorySource(directory, ["docs"], "main", {
      branch: "main",
    });
    expect(result.branch).toBe("main");
    await expect(
      readRepositorySource(directory, ["docs"], "main", { branch: "missing" }),
    ).rejects.toThrow();
  });
  it("verifies a detached CI identity without a local branch", async () => {
    const commit = git("rev-parse", "HEAD");
    git("checkout", "--detach");
    git("branch", "-D", "main");
    await expect(
      readRepositorySource(directory, ["docs"], "main", {
        branch: "main",
        ci: { branch: "main", commit: "a".repeat(40) },
      }),
    ).rejects.toThrow("identity");
    expect(
      (
        await readRepositorySource(directory, ["docs"], "main", {
          branch: "main",
          ci: { branch: "main", commit },
        })
      ).commit,
    ).toBe(commit);
  });
  it.each([
    "../outside",
    "/tmp",
    "docs/../private",
    "docs\\secret",
    "docs/",
    "docs\nprivate",
  ])("rejects unsafe root %s", async (root) => {
    await expect(
      readRepositorySource(directory, [root], "main"),
    ).rejects.toThrow("root");
  });
  it("rejects tracked symbolic links rather than reading their targets", async () => {
    await symlink("../private.txt", join(directory, "docs/linked.md"));
    git("add", ".");
    git("commit", "-m", "Link");
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow("Symbolic");
  });
  it("rejects a submodule below a selected root", async () => {
    git(
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${git("rev-parse", "HEAD")},docs/nested`,
    );
    git("commit", "-m", "Gitlink");
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow("Submodules");
  });
  it("rejects an oversized committed blob before reading it", async () => {
    await writeFile(
      join(directory, "docs/large.md"),
      "x".repeat(128 * 1024 + 1),
    );
    git("add", ".");
    git("commit", "-m", "Large");
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow("128 KiB");
  });
  it("rejects more than 200 files rather than silently truncating", async () => {
    for (let i = 0; i < 200; i++)
      await writeFile(join(directory, `docs/${i}.md`), "x");
    git("add", ".");
    git("commit", "-m", "Many");
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow("200");
  });
  it("rejects more than 4 MiB total", async () => {
    for (let i = 0; i < 33; i++)
      await writeFile(join(directory, `docs/${i}.md`), "x".repeat(128 * 1024));
    git("add", ".");
    git("commit", "-m", "Many bytes");
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow("4 MiB");
  });
  it("rejects invalid UTF-8 and empty snapshots", async () => {
    await writeFile(join(directory, "docs/binary.md"), Buffer.from([0xff]));
    git("add", ".");
    git("commit", "-m", "Invalid");
    await expect(
      readRepositorySource(directory, ["docs"], "main"),
    ).rejects.toThrow("UTF-8");
    await expect(
      readRepositorySource(directory, ["missing"], "main"),
    ).rejects.toThrow("No committed");
  });
});
