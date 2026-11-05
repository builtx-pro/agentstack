#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { AgentStackClient } from "@agentstack/sdk";
import { createMcpServer } from "./server.js";

const baseUrl = process.env.AGENTSTACK_URL;
const token = process.env.AGENTSTACK_TOKEN;
if (!baseUrl || !token) {
  process.stderr.write(
    "Set AGENTSTACK_URL and AGENTSTACK_TOKEN in the MCP process environment.\n",
  );
  process.exitCode = 1;
} else {
  try {
    const timeoutMs = Number(process.env.AGENTSTACK_TIMEOUT_MS ?? 30000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) {
      throw new Error("Invalid HTTP timeout");
    }
    const server = createMcpServer(
      new AgentStackClient({ baseUrl, token, timeoutMs }),
    );
    await server.connect(new StdioServerTransport());
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.once(signal, () => {
        void server.close().then(() => {
          process.exitCode = 0;
        });
      });
  } catch {
    process.stderr.write(
      "AgentStack MCP could not start. Check configuration and installation.\n",
    );
    process.exitCode = 1;
  }
}
