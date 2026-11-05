# MCP interface

The server implements MCP stdio using the official TypeScript SDK. It exposes tools, resources and prompts. No shell runner, arbitrary URL fetcher, agent acceptance or remote OAuth server is included.

| Tool | Purpose | Required scope |
|---|---|---|
| `get_capabilities` | Server version and supported features | read |
| `list_projects` | Paginated granted projects | read |
| `get_project_context` | Bounded rules, docs, planning and open notes | read |
| `search_objects` | Screens/assets/flows/docs/planning search | read |
| `get_object` | Exact object and current revision | read |
| `list_review_items` | Notes by status or target | read |
| `get_history` | Authorized object/note revisions | read |
| `get_progress` | Real project/group progress | read |
| `create_review_item` | Contextual note with request UUID | review |
| `claim_review_item` | Atomic versioned claim | review |
| `release_review_item` | Release your claim with a reason | review |
| `submit_review_result` | Report actual checks for human acceptance | review |
| `create_work_item` | Explicitly requested plan/feature/proposal | write |
| `update_work_item` | Versioned planning edit, no done status | write |
| `propose_document_change` | Review note for a document/rule change | review |

Scopes are enforced by the API and intersect current membership. `read` is the base scope, not a way to obtain all projects.

Resources:
- `agentstack://workflow`: trust boundaries and review steps.
- `agentstack://projects/{projectId}/context`: scoped context JSON.
- `agentstack://projects/{projectId}/objects/{objectId}`: scoped target JSON.

Prompts `review_feedback`, `plan_sprint`, `update_document` accept a project UUID and include current context labelled as untrusted data. They do not claim or mutate work on their own.

Cancellation propagates to HTTP. Safe errors contain code/status and an actionable generic message; upstream response bodies and credentials are not echoed. The transport uses stdout only for JSON-RPC; startup errors go to stderr.

Implementation reference: [official SDK v1 server guide](https://ts.sdk.modelcontextprotocol.io/server). Protocol compatibility does not imply every host supports every resource/prompt UX; CLI/context export remains available.
