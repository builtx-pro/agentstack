# MCP client templates

Build AgentStack first. Replace `/absolute/path/to/agentstack` with the actual checkout path. Set `AGENTSTACK_URL` and `AGENTSTACK_TOKEN` in the environment inherited by the client. A GUI app may not inherit a terminal shell's environment; use the client's supported environment/secret setup. Do not replace the placeholders with a real token in a tracked file.

| Client | Template | Merge destination |
|---|---|---|
| Codex | [TOML](codex.config.toml) | User/project Codex config |
| Claude Code | [JSON](claude.mcp.json) | Project `.mcp.json` |
| Cursor | [JSON](cursor.mcp.json) | `.cursor/mcp.json` |
| Gemini CLI | [JSON](gemini.settings.json) | `mcpServers` in `settings.json` |
| VS Code local harness | [JSON](vscode.mcp.json) | `.vscode/mcp.json` |
| Copilot portable configuration | [JSON](copilot.mcp.json) | Project `.mcp.json` |

Merge a server entry instead of overwriting your existing settings. Review the configuration before trusting it. No template enables blanket automatic approval. Start with a read-only token if you only want context and search; add `review` or `write` deliberately.

Verify the client discovers `get_capabilities`, `search_objects`, `list_review_items` and `submit_review_result`. Run a read-only call before attempting a mutation. If a host does not support resources/prompts, use the tools; if it does not support stdio MCP, use the CLI and portable context export. Hosted-only connectors that accept only remote HTTP MCP are not supported by this stdio adapter.

Configuration formats were checked against these official references on 2026-11-05. Host versions and organizational policies can differ:
- [Codex MCP](https://developers.openai.com/codex/mcp/): stdio command/args and explicit environment forwarding.
- [Claude Code MCP](https://code.claude.com/docs/en/mcp): project configuration and environment expansion.
- [Cursor MCP](https://docs.cursor.com/context/model-context-protocol): configuration locations and interpolation.
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/): settings and environment expansion.
- [VS Code MCP configuration](https://code.visualstudio.com/docs/agents/reference/mcp-configuration): `servers` versus portable `mcpServers` formats.

Templates are examples for an installed local checkout. No npm package publication or one-click marketplace installation is implied.
