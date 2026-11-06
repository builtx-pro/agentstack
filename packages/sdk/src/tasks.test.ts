import { describe, it, expect, vi } from "vitest";
import { AgentStackClient } from "./client.js";
const id = "11111111-1111-4111-8111-111111111111";
const task = {
  id,
  source: "personal",
  projectId: null,
  projectName: null,
  canEdit: true,
  title: "Example",
  description: "",
  status: "ready",
  version: 1,
  archived: false,
  priority: "normal",
  blocked: false,
  checklist: [],
  tags: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
const client = (fetch: typeof globalThis.fetch) =>
  new AgentStackClient({
    baseUrl: "http://127.0.0.1:4300",
    sessionCookie: "agentstack_session=synthetic-session",
    fetch,
  });
describe("Personal task SDK", () => {
  it("reads bounded mixed boards and strips private persistence fields", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        items: [{ ...task, owner_id: id, creation_hash: "private" }],
        nextCursor: null,
      }),
    );
    const result = await client(fetch).tasks({
      source: "all",
      limit: 20,
      q: "Example",
    });
    expect(result.items[0]).toEqual(task);
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      "/tasks?source=all&limit=20&q=Example",
    );
  });
  it("creates with an explicit retry-safe identifier and preserves expectedVersion", async () => {
    const fetch = vi.fn(async () => Response.json(task));
    const api = client(fetch);
    await api.createPersonalTask({ id, title: "Example" });
    await api.updatePersonalTask(id, {
      expectedVersion: 1,
      status: "in_progress",
    });
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(String(calls[0]?.[1].body))).toMatchObject({
      id,
      title: "Example",
    });
    expect(JSON.parse(String(calls[1]?.[1].body))).toEqual({
      expectedVersion: 1,
      status: "in_progress",
    });
  });
  it("rejects missing versions and malformed paths before dispatch", () => {
    const fetch = vi.fn(async () => Response.json(task));
    expect(() =>
      client(fetch).updatePersonalTask("../foreign", { expectedVersion: 1 }),
    ).toThrow();
    expect(() => client(fetch).createPersonalTask({ id, title: "" })).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
