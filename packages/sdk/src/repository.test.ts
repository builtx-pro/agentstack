import { describe, it, expect, vi } from "vitest";
import { AgentStackClient } from "./client.js";
const id = "11111111-1111-4111-8111-111111111111";
const repository = {
  id,
  projectId: id,
  provider: "github",
  repository: "example/project",
  branch: "main",
  label: "Project",
  roots: ["docs"],
  version: 2,
  archived: false,
  hasCredential: true,
  sharePipelines: false,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
const snapshot = {
  id,
  connectionId: id,
  projectId: id,
  commit: "a".repeat(40),
  branch: "main",
  source: "provider",
  createdAt: "2026-01-01",
  pipelines: [],
  entryCount: 0,
  entries: [],
  counts: { new: 0, changed: 0, unchanged: 0, conflict: 0, missing: 0 },
};
const client = (fetch: typeof globalThis.fetch) =>
  new AgentStackClient({
    baseUrl: "http://127.0.0.1:4300",
    token: "synthetic-token",
    fetch,
  });
describe("repository SDK boundary", () => {
  it("strips credentials and internal fields from repository responses", async () => {
    const result = await client(async () =>
      Response.json({
        ...repository,
        token: "private",
        credentialCiphertext: "private",
      }),
    ).repository(id, id);
    expect(result).toEqual(repository);
  });
  it("stages exactly once with an expected connection version and no apply call", async () => {
    const fetch = vi.fn(async () => Response.json(snapshot));
    const result = await client(fetch).stageRepositorySnapshot(id, id, {
      expectedVersion: 2,
      branch: "main",
      commit: "a".repeat(40),
      files: [{ path: "docs/guide.md", content: "# Guide" }],
    });
    expect(result.id).toBe(id);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/repositories\/[^/]+\/snapshots$/);
    expect(JSON.parse(String(init.body))).toMatchObject({
      expectedVersion: 2,
      files: [{ path: "docs/guide.md", content: "# Guide" }],
    });
  });
  it("rejects unsafe or oversized inputs before sending them", async () => {
    const fetch = vi.fn(async () => Response.json(snapshot));
    for (const path of ["../secret.md", "/tmp/secret.md", "docs\\secret.md"])
      expect(() =>
        client(fetch).stageRepositorySnapshot(id, id, {
          expectedVersion: 1,
          branch: "main",
          commit: "a".repeat(40),
          files: [{ path, content: "private" }],
        }),
      ).toThrow();
    expect(() =>
      client(fetch).stageRepositorySnapshot(id, id, {
        expectedVersion: 1,
        branch: "main",
        commit: "a".repeat(40),
        files: [{ path: "docs/a.md", content: "x".repeat(131073) }],
      }),
    ).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not retry an uncertain refresh and sanitizes upstream text", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "repository_snapshot_too_large",
            message: "private provider token",
          },
        },
        { status: 413 },
      ),
    );
    await expect(client(fetch).refreshRepository(id, id, 2)).rejects.toThrow(
      "Narrow",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("accepts sanitized customer pipeline summaries without private URLs or commits", async () => {
    const group = {
      connectionId: id,
      label: "Build",
      provider: "github",
      lastCheckedAt: null,
      pipelines: [
        {
          id: "1",
          name: "CI",
          status: "passed",
          updatedAt: "2026-01-01T00:00:00.000Z",
          source: "provider",
        },
      ],
    };
    expect(
      (
        await client(async () =>
          Response.json({ items: [group], nextCursor: null }),
        ).repositoryPipelines(id)
      ).items,
    ).toEqual([group]);
  });
});
