import { describe, expect, it, vi } from "vitest";
import { AgentStackClient } from "./client.js";

const projectId = "11111111-1111-4111-8111-111111111111";
const token = "test-only-token";
function client(fetch: typeof globalThis.fetch) {
  return new AgentStackClient({
    baseUrl: "http://127.0.0.1:4300",
    token,
    fetch,
  });
}
describe("API boundary", () => {
  it("refuses credential-bearing or insecure remote URLs", () => {
    for (const baseUrl of [
      "http://example.com",
      "https://user:password@example.com",
      "file:///tmp/data",
    ]) {
      expect(() => new AgentStackClient({ baseUrl, token })).toThrow();
    }
  });
  it("sends credentials only to the fixed origin and refuses redirects", async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${token}`,
      );
      return Response.json({ items: [], nextCursor: null });
    });
    await client(fetch).projects();
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "http://127.0.0.1:4300/api/v1/projects",
    );
  });
  it("strips uncontracted fields from objects", async () => {
    const response = {
      id: projectId,
      projectId,
      key: "home",
      kind: "screen",
      title: "Home",
      description: "",
      tags: [],
      visibility: "customer",
      status: "ready",
      archived: false,
      version: 1,
      data: {},
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      passwordHash: "not-for-client",
    };
    const result = await client(async () => Response.json(response)).object(
      projectId,
      projectId,
    );
    expect(result).not.toHaveProperty("passwordHash");
  });
  it("does not trust malformed successful responses", async () => {
    await expect(
      client(async () => Response.json({ items: "wrong" })).projects(),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("returns a safe conflict without echoing secrets from error bodies", async () => {
    const api = client(async () =>
      Response.json(
        { error: { code: "version_conflict", message: token } },
        { status: 409 },
      ),
    );
    try {
      await api.projects();
    } catch (error) {
      expect(error).toMatchObject({ code: "version_conflict", status: 409 });
      expect(String(error)).not.toContain(token);
    }
  });
  it("passes cancellation and never retries a mutation", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async () => {
      throw new Error("must not call");
    });
    await expect(
      client(fetch).projects({}, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
    const failure = vi.fn(async () =>
      Response.json({ error: { code: "version_conflict" } }, { status: 409 }),
    );
    await expect(
      client(failure).transition(projectId, projectId, {
        expectedVersion: 1,
        action: "claim",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(failure).toHaveBeenCalledTimes(1);
  });
  it("rejects repeated pagination cursors instead of looping forever", async () => {
    const api = client(async () =>
      Response.json({ items: [], nextCursor: "same" }),
    );
    await expect(
      api.collect((cursor) => api.projects({ cursor }), { maxPages: 3 }),
    ).rejects.toMatchObject({ code: "pagination_cycle" });
  });
  it("bounds response bytes before parsing JSON", async () => {
    const api = new AgentStackClient({
      baseUrl: "http://localhost:4300",
      token,
      maxResponseBytes: 100,
      fetch: async () => new Response("x".repeat(101)),
    });
    await expect(api.projects()).rejects.toMatchObject({
      code: "response_too_large",
    });
  });
});
