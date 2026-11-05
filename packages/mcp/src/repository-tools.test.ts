import { afterEach, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AgentStackClient } from "@agentstack/sdk";
import { createMcpServer } from "./server.js";
const projectId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});
async function connect(fetch: typeof globalThis.fetch) {
  const server = createMcpServer(
    new AgentStackClient({
      baseUrl: "http://127.0.0.1:4300",
      token: "test",
      fetch,
    }),
  );
  const client = new Client({ name: "test", version: "1" });
  const [left, right] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(right), client.connect(left)]);
  clients.push(client);
  return client;
}
it("exposes scoped read tools and stage-only refresh, never apply or filesystem tools", async () => {
  const client = await connect(async () => Response.json({}));
  const tools = (await client.listTools()).tools;
  expect(tools.map((t) => t.name)).toEqual(
    expect.arrayContaining([
      "list_repositories",
      "list_repository_snapshots",
      "get_repository_snapshot",
      "get_repository_pipelines",
      "refresh_repository",
    ]),
  );
  expect(tools.map((t) => t.name).join(" ")).not.toMatch(
    /apply|filesystem|shell|sync_repository/,
  );
  expect(
    tools.find((t) => t.name === "refresh_repository")?.annotations,
  ).toMatchObject({
    readOnlyHint: false,
    openWorldHint: true,
    idempotentHint: false,
  });
});
it("forwards refresh version exactly once and hides raw provider errors", async () => {
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    expect(String(url)).toContain(
      `/projects/${projectId}/repositories/${connectionId}/refresh`,
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ expectedVersion: 7 });
    return Response.json(
      { error: { code: "forbidden", message: "private-provider-secret" } },
      { status: 403 },
    );
  });
  const client = await connect(fetch);
  const result = await client.callTool({
    name: "refresh_repository",
    arguments: { projectId, connectionId, expectedVersion: 7 },
  });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private-provider-secret");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("reads repository lists without issuing mutations and rejects invalid IDs", async () => {
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    expect(init?.method).toBe("GET");
    return Response.json({ items: [], nextCursor: null });
  });
  const client = await connect(fetch);
  expect(
    (
      await client.callTool({
        name: "list_repositories",
        arguments: { projectId },
      })
    ).isError,
  ).not.toBe(true);
  expect(
    (
      await client.callTool({
        name: "get_repository_snapshot",
        arguments: {
          projectId,
          connectionId: "../secret",
          snapshotId: connectionId,
        },
      })
    ).isError,
  ).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("rejects invalid MCP timeout configuration before starting or leaking config", () => {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./main.ts", import.meta.url))],
    {
      env: {
        ...process.env,
        AGENTSTACK_URL: "http://127.0.0.1:4300",
        AGENTSTACK_TOKEN: "private-timeout-token",
        AGENTSTACK_TIMEOUT_MS: "Infinity",
      },
      encoding: "utf8",
    },
  );
  expect(child.status).toBe(1);
  expect(child.stderr).toContain("could not start");
  expect(child.stderr).not.toContain("private-timeout-token");
  expect(child.stdout).toBe("");
});
