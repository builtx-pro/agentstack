import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const id = "11111111-1111-4111-8111-111111111111",
  main = fileURLToPath(new URL("./main.ts", import.meta.url));
let directory: string,
  server: Server,
  origin: string,
  provider = "local",
  fail = false;
let calls: Array<{ method: string; url: string; body: any }> = [];
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: directory,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
function run(args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", main, "--json", "repositories", ...args],
        {
          env: {
            ...process.env,
            // Runner identity belongs to the outer checkout, not this Git fixture.
            GITHUB_REF_NAME: undefined,
            GITHUB_SHA: undefined,
            CI_COMMIT_BRANCH: undefined,
            CI_COMMIT_SHA: undefined,
            AGENTSTACK_URL: origin,
            AGENTSTACK_PROJECT: id,
            AGENTSTACK_TOKEN: "synthetic-token",
          },
          stdio: "pipe",
        },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.stdin.end();
    },
  );
}
beforeEach(async () => {
  calls = [];
  provider = "local";
  fail = false;
  directory = await mkdtemp(join(tmpdir(), "agentstack-cli-repo-"));
  git("init", "-b", "main");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  await mkdir(join(directory, "docs"));
  await writeFile(join(directory, "docs/guide.md"), "# Original");
  git("add", ".");
  git("commit", "-m", "Fixture");
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : undefined;
    calls.push({ method: req.method!, url: req.url!, body });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      res.end(
        JSON.stringify({
          id,
          projectId: id,
          provider,
          repository: "example/project",
          branch: "main",
          label: "Fixture",
          roots: ["docs"],
          version: 7,
          archived: false,
          hasCredential: false,
          sharePipelines: false,
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        }),
      );
      return;
    }
    if (fail) {
      res.writeHead(409);
      res.end(
        JSON.stringify({
          error: {
            code: "version_conflict",
            message: "PRIVATE TOKEN FROM PROVIDER",
          },
        }),
      );
      return;
    }
    res.writeHead(201);
    res.end(
      JSON.stringify({
        id,
        connectionId: id,
        projectId: id,
        commit: git("rev-parse", "HEAD"),
        branch: "main",
        source: req.url?.endsWith("/refresh") ? "provider" : "reported",
        createdAt: "2026-01-01",
        entryCount: 1,
        pipelines: [],
        entries: [
          {
            key: "guide",
            path: "docs/guide.md",
            kind: "document",
            title: "Guide",
            state: "new",
            currentVersion: null,
            draft: {
              key: "guide",
              kind: "document",
              title: "Guide",
              data: { markdown: "# Original" },
            },
          },
        ],
        counts: { new: 1, changed: 0, unchanged: 0, conflict: 0, missing: 0 },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
describe("repository CLI", () => {
  it("defaults to a content-free dry run without POST", async () => {
    await writeFile(join(directory, "docs/guide.md"), "PRIVATE DIRTY");
    const result = await run(["sync", id, "--repo", directory]);
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      dryRun: true,
      applied: false,
      expectedVersion: 7,
      files: [{ path: "docs/guide.md", bytes: 10 }],
    });
    expect(calls.map((c) => c.method)).toEqual(["GET"]);
    expect(result.stdout + result.stderr).not.toContain("PRIVATE DIRTY");
  });
  it("stages committed content exactly once and never applies objects", async () => {
    const result = await run(["sync", id, "--repo", directory, "--stage"]);
    expect(result.code, result.stderr).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe(
      `/api/v1/projects/${id}/repositories/${id}/snapshots`,
    );
    expect(calls[1]?.body).toMatchObject({
      expectedVersion: 7,
      commit: git("rev-parse", "HEAD"),
      branch: "main",
      files: [{ path: "docs/guide.md", content: "# Original" }],
    });
    expect(JSON.parse(result.stdout).applied).toBe(false);
    expect(result.stdout).not.toContain("# Original");
  });
  it("refreshes the hosted provider with the exact current version", async () => {
    provider = "github";
    const result = await run(["refresh", id]);
    expect(result.code, result.stderr).toBe(0);
    expect(calls[1]?.url).toMatch(/\/refresh$/);
    expect(calls[1]?.body).toEqual({ expectedVersion: 7 });
    expect(JSON.parse(result.stdout).source).toBe("provider");
  });
  it("does not retry or echo private server errors after staging failure", async () => {
    fail = true;
    const result = await run(["sync", id, "--repo", directory, "--stage"]);
    expect(result.code).toBe(1);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(result.stderr).toContain(
      "Read repository snapshots before retrying",
    );
    expect(result.stderr).not.toContain("PRIVATE TOKEN");
  });
  it("marks all uploaded pipeline summaries reported, even when input claims provider verification", async () => {
    const file = join(directory, "pipeline.json");
    await writeFile(
      file,
      JSON.stringify([
        {
          id: "1",
          name: "CI",
          status: "passed",
          commit: git("rev-parse", "HEAD"),
          updatedAt: "2026-01-01T00:00:00Z",
          source: "provider",
        },
      ]),
    );
    const result = await run([
      "sync",
      id,
      "--repo",
      directory,
      "--stage",
      "--pipeline-json",
      file,
    ]);
    expect(result.code, result.stderr).toBe(0);
    expect(calls[1]?.body.pipelines[0].source).toBe("reported");
  });
});
