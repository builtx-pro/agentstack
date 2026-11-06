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
