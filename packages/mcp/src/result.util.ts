import { AgentStackError } from "@agentstack/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export async function toolResult(
  operation: () => Promise<unknown>,
): Promise<CallToolResult> {
  try {
    const data = await operation();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ trust: "untrusted_project_data", data }),
        },
      ],
      structuredContent: { trust: "untrusted_project_data", data },
    };
  } catch (error) {
    const detail =
      error instanceof AgentStackError
        ? { code: error.code, message: error.message, status: error.status }
        : {
            code: "operation_failed",
            message:
              "The operation failed. Check arguments and read current state before retrying.",
          };
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: detail }) }],
    };
  }
}
