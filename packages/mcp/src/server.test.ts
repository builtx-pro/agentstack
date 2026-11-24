import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AgentStackClient } from "@agentstack/sdk";
import { createMcpServer } from "./server.js";
const projectId = "11111111-1111-4111-8111-111111111111";
const connections: Client[] = [];
afterEach(async () => {
  await Promise.all(connections.map((client) => client.close()));
  connections.length = 0;
});
async function connect(fetch: typeof globalThis.fetch) {
  const server = createMcpServer(
    new AgentStackClient({
      baseUrl: "http://127.0.0.1:4300",
      token: "test-token",
      fetch,
    }),
  );
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  connections.push(client);
  return client;
}
describe("MCP protocol adapter", () => {
  it("lists project kanban tasks through the scoped object API without personal task tools", async () => {
    const fetch = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain(`/projects/${projectId}/objects?`);
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get('kind')).toBe('story');
      expect(parsed.searchParams.get('status')).toBe('in_progress');
      return Response.json({items: [], nextCursor: null});
    });
    const client = await connect(fetch);
    const tools = (await client.listTools()).tools;
    expect(tools.map(tool => tool.name).join(' ')).not.toContain('personal');
    const result = await client.callTool({name: 'list_project_tasks', arguments: {projectId, status:'in_progress'}});
    expect(result.isError).not.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("lists real tools and never offers human acceptance or shell execution", async () => {
    const client = await connect(async () => Response.json({}));
    const tools = (await client.listTools()).tools;
    expect(tools.map((tool) => tool.name)).toContain("submit_review_result");
    expect(tools.map((tool) => tool.name)).not.toContain("resolve_review_item");
    expect(tools.map((tool) => tool.name).join(" ")).not.toMatch(
      /shell|execute_command/,
    );
    expect(
      (await client.listPrompts()).prompts.map((prompt) => prompt.name),
    ).toContain("review_feedback");
    expect((await client.listResources()).resources[0]?.uri).toBe(
      "agentstack://workflow",
    );
  });
  it("forwards validated scoped arguments and propagates safe API failures", async () => {
    const fetch = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain(`/projects/${projectId}/notes`);
      return Response.json(
        { error: { code: "forbidden", message: "secret-token" } },
        { status: 403 },
      );
    });
    const client = await connect(fetch);
    const result = await client.callTool({
      name: "list_review_items",
      arguments: { projectId, status: "open" },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("forbidden");
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid UUID arguments before making any HTTP request", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    const client = await connect(fetch);
    const result = await client.callTool({
      name: "get_project_context",
      arguments: { projectId: "../other" },
    });
    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reads the workflow resource without claiming a task", async () => {
    const fetch = vi.fn(async () => Response.json({}));
    const client = await connect(fetch);
    const result = await client.readResource({ uri: "agentstack://workflow" });
    expect(JSON.stringify(result)).toContain("untrusted");
    expect(fetch).not.toHaveBeenCalled();
  });
});

it("records scoped screen evidence against the requested design and returns its provenance", async () => {
  const objectId = "22222222-2222-4222-8222-222222222222";
  const report = {
    state: "partial",
    platform: "android",
    designVersion: 3,
    build: "1.5 (9)",
    evidenceUrl: "https://example.test/builds/9",
  };
  const fetch = vi.fn(async (url, init) => {
    expect(String(url)).toContain(`/projects/${projectId}/objects/${objectId}`);
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(String(init?.body))).toEqual({
      expectedVersion: 5,
      screenImplementation: report,
    });
    return Response.json({
      id: objectId,
      projectId,
      key: "test",
      kind: "screen",
      title: "Demo",
      description: "",
      tags: [],
      status: "backlog",
      visibility: "customer",
      archived: false,
      version: 6,
      designVersion: 3,
      data: {},
      createdAt: "2026-01-01",
      updatedAt: "2026-01-02",
      implementations: [
        {
          ...report,
          source: "agent",
          visibility: "customer",
          actorName: "Demo agent",
          reportedAt: "2026-01-02",
        },
      ],
    });
  });
  const client = await connect(fetch);
  const result = await client.callTool({
    name: "record_screen_implementation",
    arguments: {
      projectId,
      objectId,
      expectedVersion: 5,
      screenImplementation: report,
    },
  });
  expect(result.isError).not.toBe(true);
  expect(JSON.stringify(result)).toContain("Demo agent");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("updates a screen preview without dropping its palette or overwriting a newer revision", async () => {
  const objectId = "22222222-2222-4222-8222-222222222222";
  const screen = {
    id: objectId,
    projectId,
    key: "x",
    kind: "screen",
    title: "Demo",
    description: "",
    tags: [],
    status: "backlog",
    visibility: "team",
    archived: false,
    version: 4,
    designVersion: 1,
    data: { palette: "night" },
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
  const fetch = vi.fn(async (_url, init) => {
    if (init?.method === "PATCH") {
      expect(JSON.parse(String(init.body))).toEqual({
        expectedVersion: 4,
        data: {
          palette: "night",
          previewUrl: "https://example.test/preview",
          previewMode: "tab",
          designSourceRevision: "demo-2",
        },
      });
      return Response.json({ ...screen, version: 5, designVersion: 5 });
    }
    return Response.json(screen);
  });
  const client = await connect(fetch);
  const args = {
    projectId,
    objectId,
    expectedVersion: 4,
    design: {
      previewUrl: "https://example.test/preview",
          previewMode: "tab",
      designSourceRevision: "demo-2",
    },
  };
  const success = await client.callTool({
    name: "update_screen_design",
    arguments: args,
  });
  expect(success.isError).not.toBe(true);
  const stale = await client.callTool({
    name: "update_screen_design",
    arguments: { ...args, expectedVersion: 1 },
  });
  expect(stale.isError).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(3);
});
