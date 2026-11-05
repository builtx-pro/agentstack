# Architecture

Modular TypeScript monolith, PostgreSQL, Mantine SPA. REST is the single application boundary; CLI and stdio MCP are clients. PostgreSQL is the operational source of truth. Files are immutable storage objects protected by target access. Git is an explicit import/export integration, never an implicit second writer.

```text
apps/web            FSD app/pages/widgets/units/shared
apps/server         HTTP, authorization, use cases, migrations
packages/contracts  Zod request/response schemas, capabilities
packages/sdk        typed client used by CLI and MCP
packages/cli        bootstrap, import/export, doctor, context
packages/mcp        stdio tools/resources/prompts
packages/ui         theme and reusable Mantine composition
examples/           synthetic data only
agent-kit/          portable instructions and recipes
```

Each update and immutable revision/audit event share a transaction. Expected versions detect concurrent writes. All reads include project scope; unavailable objects return 404. Access extends to revisions, aggregates and blobs. RLS uses a non-bypass application role and forced policies; bootstrap/migration credentials are separate.

Screens, assets, docs and work items are typed targets, not arbitrary JSON executable objects. Public serializers allow only contract fields. Human membership and agent token scopes intersect at the service boundary.

## References checked during discovery
- https://mantine.dev/guides/vite/
- https://mantine.dev/styles/css-modules/
- https://modelcontextprotocol.io/specification/latest/basic/authorization
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe

No Mantine MCP connector is available in this session; use official documentation and installed package types as the fallback.
