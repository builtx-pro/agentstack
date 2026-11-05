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
    const server = createMcpServer(new AgentStackClient({ baseUrl, token }));
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
