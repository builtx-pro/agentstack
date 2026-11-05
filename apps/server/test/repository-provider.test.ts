import { describe, it, expect, vi } from "vitest";
import {
  fetchRepository,
  validateRepository,
} from "../src/repositories/repository-provider.service.js";
import type { Repository } from "@agentstack/contracts";
const sha = "a".repeat(40),
  tree = "b".repeat(40),
  blob = "c".repeat(40);
const connection: Repository = {
  id: "x",
  projectId: "p",
  provider: "github",
  repository: "owner/repo",
  branch: "main",
  label: "Test",
  roots: ["docs"],
  version: 1,
  archived: false,
  hasCredential: true,
  sharePipelines: false,
  createdAt: "",
  updatedAt: "",
};
const response = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
describe("bounded provider connector", () => {
  it("fetches immutable GitHub blobs and pipeline summaries from fixed hosts only", async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        expect(
          String(url).startsWith("https://api.github.com/repos/owner/repo/"),
        ).toBe(true);
        expect(init?.redirect).toBe("error");
        expect((init?.headers as any).Authorization).toBe(
          "Bearer synthetic-token",
        );
        if (String(url).includes("/commits/"))
          return response({ sha, commit: { tree: { sha: tree } } });
        if (String(url).includes("/git/trees/"))
          return response({
            truncated: false,
            tree: [
              {
                type: "blob",
                mode: "100644",
                path: "docs/spec.md",
                sha: blob,
                size: 20,
              },
              {
                type: "blob",
                mode: "120000",
                path: "docs/symlink.md",
                sha: blob,
              },
            ],
          });
        if (String(url).includes("/git/blobs/"))
          return response({
            encoding: "base64",
            content: Buffer.from("# Specification").toString("base64"),
          });
        return response({
          workflow_runs: [
            {
              id: 1,
              name: "Tests",
              status: "completed",
              conclusion: "success",
              head_sha: sha,
              html_url: "https://github.com/owner/repo/actions/runs/1",
              updated_at: "2026-11-05T00:00:00Z",
            },
          ],
        });
      },
    );
    const result = await fetchRepository(
      connection,
      "synthetic-token",
      fetcher as typeof fetch,
    );
    expect(result.files).toEqual([
      { path: "docs/spec.md", content: "# Specification" },
    ]);
    expect(result.pipelines[0]?.status).toBe("passed");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("rejects truncated trees, unsafe repository names and provider failures without echoing secrets", async () => {
    expect(() => validateRepository("github", "../repo")).toThrow();
    expect(() => validateRepository("github", "https://evil.test")).toThrow();
    const fetcher = vi.fn(async (url: any) =>
      String(url).includes("/commits/")
        ? response({ sha, commit: { tree: { sha: tree } } })
        : response({ truncated: true, tree: [] }),
    );
    await expect(
      fetchRepository(connection, undefined, fetcher as typeof fetch),
    ).rejects.toMatchObject({ code: "repository_tree_incomplete" });
    await expect(
      fetchRepository(
        connection,
        "secret",
        async () => new Response("secret", { status: 429 }),
      ),
    ).rejects.toMatchObject({ status: 429, code: "repository_rate_limited" });
  });
  it("fetches GitLab nested repositories, fixed commit blobs and pipeline status", async () => {
    const fetcher = vi.fn(async (url: any) => {
      const u = String(url);
      expect(
        u.startsWith("https://gitlab.com/api/v4/projects/group%2Fsub%2Frepo/"),
      ).toBe(true);
      if (u.includes("/commits/")) return response({ id: sha });
      if (u.includes("/tree?")) {
        expect(u).toContain(`ref=${sha}`);
        return response([
          { type: "blob", mode: "100644", path: "docs/spec.md", id: blob },
        ]);
      }
      if (u.includes("/pipelines?"))
        return response([
          {
            id: 2,
            iid: 1,
            status: "running",
            sha,
            web_url: "https://gitlab.com/group/sub/repo/-/pipelines/2",
            updated_at: "2026-11-05T00:00:00Z",
          },
        ]);
      return new Response("# GitLab spec");
    });
    const result = await fetchRepository(
      { ...connection, provider: "gitlab", repository: "group/sub/repo" },
      undefined,
      fetcher as typeof fetch,
    );
    expect(result.files[0]?.content).toBe("# GitLab spec");
    expect(result.pipelines[0]?.status).toBe("running");
  });
});

const githubFixture =
  (
    count: number,
    blobResponse: (url: string, init?: RequestInit) => Promise<Response>,
  ): typeof fetch =>
  async (url, init) => {
    const u = String(url);
    if (u.includes("/commits/"))
      return response({ sha, commit: { tree: { sha: tree } } });
    if (u.includes("/trees/"))
      return response({
        truncated: false,
        tree: Array.from({ length: count }, (_, i) => ({
          type: "blob",
          mode: "100644",
          path: `docs/${i}.md`,
          sha: i.toString(16).padStart(40, "0"),
        })),
      });
    if (u.includes("/actions/")) return response({ workflow_runs: [] });
    return blobResponse(u, init);
  };

it("caps concurrent blob requests at four", async () => {
  let active = 0,
    peak = 0,
    calls = 0;
  const fetched = await fetchRepository(
    connection,
    undefined,
    githubFixture(12, async () => {
      active++;
      calls++;
      peak = Math.max(peak, active);
      try {
        await new Promise((r) => setTimeout(r, 2));
        return response({
          encoding: "base64",
          content: Buffer.from("# File").toString("base64"),
        });
      } finally {
        active--;
      }
    }),
  );
  expect(fetched.files).toHaveLength(12);
  expect(calls).toBe(12);
  expect(peak).toBe(4);
  expect(active).toBe(0);
});

it("aborts remaining workers on an invalid blob without starting another batch", async () => {
  let started = 0,
    cancelled = 0;
  const fetcher = githubFixture(20, async (_url, init) => {
    const n = started++;
    if (n === 0) {
      await Promise.resolve();
      return response({ encoding: "base64", content: "%%%invalid%%%" });
    }
    return new Promise((_resolve, reject) => {
      const abort = () => {
        cancelled++;
        reject(new Error("aborted"));
      };
      if (init?.signal?.aborted) abort();
      else init?.signal?.addEventListener("abort", abort, { once: true });
    });
  });
  await expect(
    fetchRepository(connection, undefined, fetcher),
  ).rejects.toMatchObject({ code: "repository_response_invalid" });
  expect(started).toBe(4);
  expect(cancelled).toBe(3);
});

it("limits decoded UTF-8 blob bytes and aggregate bytes at their exact boundaries", async () => {
  const exact = Buffer.from("я".repeat(65536));
  expect(exact.length).toBe(131072);
  const blobResult = (content: Buffer) =>
    response({ encoding: "base64", content: content.toString("base64") });
  const accepted = await fetchRepository(
    connection,
    undefined,
    githubFixture(32, async () => blobResult(exact)),
  );
  expect(accepted.files).toHaveLength(32);
  await expect(
    fetchRepository(
      connection,
      undefined,
      githubFixture(1, async () =>
        blobResult(Buffer.concat([exact, Buffer.from("x")])),
      ),
    ),
  ).rejects.toMatchObject({ status: 413, code: "repository_too_large" });
  await expect(
    fetchRepository(
      connection,
      undefined,
      githubFixture(33, async () => blobResult(exact)),
    ),
  ).rejects.toMatchObject({ status: 413, code: "repository_too_large" });
});

it("cancels an oversized streamed provider response before buffering more than the cap", async () => {
  let pulled = 0,
    cancelled = false;
  const fetcher: typeof fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled++;
          controller.enqueue(new Uint8Array(3 * 1024 * 1024));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  await expect(
    fetchRepository(connection, undefined, fetcher),
  ).rejects.toMatchObject({ status: 413, code: "repository_too_large" });
  expect(cancelled).toBe(true);
  expect(pulled).toBeLessThanOrEqual(4);
});

it("aborts a stalled request at 15 seconds and the whole refresh at 60 seconds", async () => {
  vi.useFakeTimers();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    const c = new AbortController();
    setTimeout(
      () => c.abort(new DOMException("Timed out", "TimeoutError")),
      ms,
    );
    return c.signal;
  });
  const delayed = (
    value: unknown,
    init?: RequestInit,
    delay = 14000,
  ): Promise<Response> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        init?.signal?.removeEventListener("abort", abort);
        resolve(response(value));
      }, delay);
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      };
      init?.signal?.addEventListener("abort", abort, { once: true });
    });
  try {
    const stalled = fetchRepository(connection, undefined, (_url, init) =>
      delayed({}, init, 20000),
    );
    const checked = expect(stalled).rejects.toMatchObject({
      code: "repository_unavailable",
    });
    await vi.advanceTimersByTimeAsync(15000);
    await checked;
    vi.clearAllTimers();
    let blobStarts = 0,
      blobAborts = 0;
    const began = Date.now();
    const fetcher: typeof fetch = async (url, init) => {
      const u = String(url);
      if (u.includes("/commits/"))
        return delayed({ sha, commit: { tree: { sha: tree } } }, init);
      if (u.includes("/trees/"))
        return delayed(
          {
            truncated: false,
            tree: Array.from({ length: 8 }, (_, i) => ({
              type: "blob",
              mode: "100644",
              path: `docs/${i}.md`,
              sha: blob,
            })),
          },
          init,
        );
      if (u.includes("/actions/")) return delayed({ workflow_runs: [] }, init);
      blobStarts++;
      try {
        return await delayed(
          {
            encoding: "base64",
            content: Buffer.from("# File").toString("base64"),
          },
          init,
        );
      } catch (e) {
        blobAborts++;
        throw e;
      }
    };
    const total = fetchRepository(connection, undefined, fetcher);
    const totalCheck = expect(total).rejects.toMatchObject({
      code: "repository_unavailable",
    });
    await vi.advanceTimersByTimeAsync(60000);
    await totalCheck;
    expect(Date.now() - began).toBe(60000);
    expect(blobStarts).toBe(8);
    expect(blobAborts).toBe(4);
    expect(timeout).toHaveBeenCalledWith(15000);
    expect(timeout).toHaveBeenCalledWith(60000);
  } finally {
    timeout.mockRestore();
    vi.useRealTimers();
  }
});
