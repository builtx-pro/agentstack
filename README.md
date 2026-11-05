# AgentStack

**Review what your coding agent builds. Give it precise feedback. Keep the whole project in view.**

AgentStack is a self-hosted workspace for developers, designers, customers and coding agents. Arrange screens into flows, discuss a specific revision, review assets, edit project knowledge and track delivery in one place.

[Русский](README.ru.md) · [Install](docs/runbooks/installation.md) · [Agent setup](docs/agents/README.md) · [Documentation](docs/README.md)

## The working loop

1. Import screens, flows and illustrations, or add them in the browser.
2. Open a screen: preview on the left, discussion on the right. Leave a concrete note on that revision.
3. Ask your existing agent to read the project's rules and review queue through MCP or CLI.
4. The agent claims an item, changes your source repository, runs checks and submits its evidence.
5. Review the result, accept it or send it back. The comment, revisions and decision remain in history.

Saving a comment does not launch an LLM or spend provider credits. AgentStack coordinates your existing tools; it does not execute arbitrary project code on the server.

## What is included

| Area | Workflow |
| --- | --- |
| Screens | Ordered user flows, alternative states, search, tags, variants, themes and shareable links |
| Assets | Images and illustrations, protected files, used-by references, discussions and visual history |
| Feedback | Revision-bound notes, expiring claims, evidence, human acceptance and reopening |
| Knowledge | Markdown documents, agent rules, editable checklists, history and restoration |
| Planning | Waves, epics, sprints, stories, features and proposals converted into work |
| Progress | Counts from actual stories, group progress, historical scope and activity |
| Access | Multiple private projects, administrator/developer/customer roles and scoped expiring tokens |
| History | Immutable revision records, archive/unarchive, optimistic conflicts and content restoration |
| Agents | TypeScript SDK, CLI, stdio MCP, portable context and agent recipes |

The public repository contains the engine and a fictional starter project. Your imported screenshots, comments, credentials and customer data stay in your deployment.

## Install on a VPS

For a clean Ubuntu/Debian VPS, the [one-command installer](docs/runbooks/vps-one-command.md) configures Docker, the first administrator, your domain and automatic HTTPS. It pins the source commit, preserves interrupted-install state and refuses to overwrite existing deployments. No host Node.js installation is required.

## Quick start

Requirements: Docker with Compose, Git and Node.js 22.22 or later.

```sh
git clone https://github.com/builtx-pro/agentstack.git
cd agentstack
node tools/setup/init-env.mjs --email you@example.com
docker compose up -d --build
cat .data/bootstrap-password | docker compose run --rm -T bootstrap
```

Open [localhost:4311](http://localhost:4311). Sign in with your email and the unique password in `.data/bootstrap-password`. Store it privately. No shared default password exists.

Create a project. In **Settings → Import**, select the `examples/starter` folder and `manifest.json`, review the dry run, then apply. The fictional recovery flow includes screens, an asset, rules and a small delivery plan.

For HTTPS, backups, restoration and upgrades, follow the [operator guides](docs/runbooks/installation.md). The database is not exposed on a host port by the default Compose file.

## Connect an agent

Build the local SDK/CLI/MCP:

```sh
npm ci
npm run build
```

Create a project token in Settings. Supply `AGENTSTACK_URL` and `AGENTSTACK_TOKEN` through your client's environment, not a committed configuration file. The stdio executable is `packages/mcp/dist/main.js`.

[Client templates](agent-kit/clients/README.md) cover the common configuration shape. [Agent recipes](agent-kit/README.md) explain how to read context, respect leases, handle conflicts and submit results. A text context bundle works with models that cannot use MCP.

Agents cannot accept their own results or silently change operating rules. The same API permissions apply to the browser, CLI and MCP.

## Architecture and development

TypeScript monorepo: React + custom Mantine theme, CSS Modules, TanStack Router/Query, Zod, Fastify and PostgreSQL. One application container, one database, immutable file storage. No Redis or Kubernetes requirement.

```sh
npm ci
npm run build
npm run typecheck
npm test
npm run test:migration
npm run test:setup
```

Backend tests create an isolated PostgreSQL container. See [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) and the [API contract](docs/api/contract.md).

## Release status and boundaries

Repository integration adds GitHub/GitLab connections, reviewed Markdown imports, CLI/CI synchronization and pipeline summaries. See [the repository guide](docs/agents/repository-sync.md) for setup and limits and [0.2.0 verification](docs/releases/0.2.0-verification.md) for observed checks.

The 0.1.0 implementation has passed the [recorded release checks](docs/releases/0.1.0-verification.md), including a verified private production migration. Project-specific evidence and credentials remain outside this public repository.

MCP is stdio, not an OAuth-enabled remote MCP service. Git exchange is explicit import/export with version checks, not a background Git synchronizer. Preview URLs remain your responsibility; the embedded frame is sandboxed. No automatic agent runner, email delivery service or claimed productivity benchmark is bundled.

## License

[Apache-2.0](LICENSE) for the engine, templates and synthetic examples. Imported project materials retain their own ownership and licensing. See [NOTICE](NOTICE).
