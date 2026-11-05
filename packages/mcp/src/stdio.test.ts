import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
let server: Server | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
});
describe("stdio executable", () => {
  it("initializes and calls the real HTTP adapter without stdout noise", async () => {
    server = createServer((request, response) => {
      expect(request.headers.authorization).toBe(
        "Bearer synthetic-stdio-token",
      );
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          version: "0.1.0",
          apiVersion: 1,
          objectKinds: ["screen", "asset"],
          features: ["review"],
          mcpTransport: "stdio",
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        fileURLToPath(new URL("./main.ts", import.meta.url)),
      ],
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        AGENTSTACK_URL: `http://127.0.0.1:${address.port}`,
        AGENTSTACK_TOKEN: "synthetic-stdio-token",
      },
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    client = new Client({ name: "stdio-test", version: "1.0.0" });
    await client.connect(transport);
    const result = await client.callTool({
      name: "get_capabilities",
      arguments: {},
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      data: { apiVersion: 1, mcpTransport: "stdio" },
    });
    expect(stderr).not.toContain("synthetic-stdio-token");
  });
});
