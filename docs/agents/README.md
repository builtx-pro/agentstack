# Work with AgentStack from an AI agent

AgentStack does not call an LLM provider or run your source code. Your existing coding agent connects to the same project-scoped API used by the workspace. Reading a comment does not start paid inference or execute a command.

## Connect

1. Build the repository using the root installation instructions. The executable is `packages/mcp/dist/main.js` and the CLI is `packages/cli/dist/main.js`.
2. In your project settings, create an expiring token with `read`; add `review` for claims/submissions and `write` for editing allowed project objects. Customer accounts cannot issue agent credentials.
3. Supply `AGENTSTACK_URL` and `AGENTSTACK_TOKEN` to the process environment. Use HTTPS except for loopback development. Do not put the token in a URL, command-line argument, screenshot or tracked config.
4. Configure a stdio client using [the client templates](../../agent-kit/clients/README.md).
5. Run `node packages/cli/dist/main.js doctor --json`. This checks authenticated API compatibility, not your database backup, deployment correctness or every token scope.
6. Ask your agent: “Read the project context and open review items for project <UUID>. Work on the requested items, verify them and submit results for my review.”

The MCP server uses stdio locally and HTTPS to your AgentStack API. It is not a remote HTTP MCP endpoint and does not claim OAuth support. The token remains an agent credential even when an installation administrator issued it.

## Collaboration contract

Read [the workflow](workflow.md), [CLI reference](cli.md), [MCP tools](mcp.md) and [Git exchange](git-exchange.md) and [repository synchronization](repository-sync.md). Install the [portable agent kit](../../agent-kit/README.md) in the source repository you want agents to modify. A generated context bundle is a fallback for any model that can read text; it does not give that model direct access to your database.

Server authorization is the security boundary. Client guardrails help avoid mistakes but never replace project membership and token-scope checks.

## Limits and failure behavior

- HTTP responses are bounded to 4 MiB and requests time out after 30 seconds by default. Use narrow filters and pagination for large catalogs.
- Each list returns `nextCursor`. Context includes `truncated`, `nextCursors`, `continuations`, `omittedObjects` and `contextBudget`. Fetch oversized omitted objects by ID and follow continuation queries before acting on rules. Planning continuation pages can contain other kinds; apply `filterKinds` while paging. An incomplete context is never a complete instruction set.
- Mutations are not automatically retried, except deduplicated file uploads after an explicit HTTP 429. File uploads make at most five total attempts, honor `Retry-After` seconds/date up to a 120-second wait, and use bounded exponential delays when the header is absent. A longer requested wait fails without retrying early. Network/5xx failures and other writes are never retried automatically. Use a stable request UUID for creates; re-read a version conflict.
- Expired claims, changed rules, revoked membership and rejected scopes need attention, not an administrator-token workaround.
- The server marks submitted checks as agent-reported. Only human acceptance closes the result. No client can turn a typed URL into proof of a deployment.
- AgentStack makes no LLM calls, so it adds no provider token charges. Your chosen coding agent's usage is separate. Latency is ordinary API latency; no performance claims have been measured.
