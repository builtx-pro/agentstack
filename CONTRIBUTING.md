# Contributing to AgentStack

Contributions are welcome: bug reports, documentation, accessibility, translations, tests and focused product improvements. You do not need permission to fork the repository or submit a pull request. Public issues and PRs can be written in English or Russian; keep source documentation in English.

## Find a starting point

- Browse [good first issues](https://github.com/builtx-pro/agentstack/labels/good%20first%20issue) and [help wanted](https://github.com/builtx-pro/agentstack/labels/help%20wanted). Labels identify scoped work, not a guarantee that an issue is currently available.
- Ask usage questions or discuss an early idea in [Discussions](https://github.com/builtx-pro/agentstack/discussions).
- Use an [issue template](https://github.com/builtx-pro/agentstack/issues/new/choose) for a reproducible bug or concrete feature proposal. Search existing issues first.
- Discuss large redesigns, new infrastructure or public API changes before implementation. Small fixes can go directly to a PR.

Read [AGENTS.md](AGENTS.md), the [architecture](docs/architecture/overview.md) and the relevant [story](epics/README.md). Existing planning documents describe the work; maintainers can help connect a new contribution to them. Do not invent completed milestones or create an entire epic for a typo fix.

## Fork, branch and verify

Requirements: Git, Node.js 22.22 or later and a running Docker daemon. Tests start isolated PostgreSQL containers; never point them at a working or production database.

1. Fork this repository on GitHub, clone your fork and create a feature branch from current upstream `main`.
2. Install and verify the source:

   ```sh
   npm ci
   npm run build
   npm run typecheck
   npm test
   npm run test:migration
   npm run test:setup
   npx playwright install --with-deps chromium
   npm run test:e2e --workspace @agentstack/web
   npm run test:themes:production --workspace @agentstack/web
   ```

   Browser installation on Linux may request system-package privileges. For a running local application, follow the [installation guide](docs/runbooks/installation.md) and import `examples/starter`. Rebuilding with `docker compose up -d --build` applies source changes to that local installation. Keep generated `.env` and `.data` files private.

3. Add a meaningful regression test for behavior changes, especially permissions, version conflicts and imports. Documentation-only fixes do not need artificial tests.
4. Push your feature branch to your fork and open a PR against `builtx-pro/agentstack:main`. Draft PRs are welcome.

## Review and merge

Explain the problem, changed behavior and verification. Link the issue or story when there is one. Include synthetic before/after screenshots for visual changes and migration/recovery notes for data changes. Keep each PR focused and respond to review feedback; there is no promised response SLA.

`main` requires a pull request, the GitHub Actions `verify` check on an up-to-date branch, and resolved review conversations. Force pushes and branch deletion are blocked. A separate review rule requires one code-owner approval and dismisses stale approvals after new commits. Organization owners can bypass only that review rule through a PR, so a sole maintainer can maintain the project; the separate CI/PR protection has no bypass actors. This is not an independent human approval and must never be presented as one. See the [governance runbook](docs/runbooks/repository-governance.md) for the settings and their limits.

External fork workflows require maintainer approval before execution. A pending workflow is not a rejection of your contribution. Maintainers inspect workflow/dependency changes before authorizing a run. PR workflows use a read-only token, receive no repository secrets and do not deploy. Approval to run CI is separate from approval to merge.

## Code and UI conventions

Use the existing TypeScript monorepo, custom Mantine theme, CSS Modules, TanStack Router/Query and Zod boundaries. Preserve browser, API, SDK and MCP behavior together. New infrastructure needs an architecture decision and an installation/backup plan.

Use semantic HTML and test the rendered DOM, keyboard/focus behavior, desktop/mobile layout and both themes. Include loading, empty, error/retry and mutation states. Keep query keys scoped, lists bounded and invalidation deliberate. Do not claim performance or accessibility improvements without evidence.

## Safe contributions and coding agents

Use synthetic fixtures only. Never submit customer screenshots, comments, exports, credentials or database dumps. Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not a public issue.

AI-assisted contributions are welcome. You remain responsible for the code and its license, tests and factual claims. Explain material agent-generated changes and what you personally verified; do not attach private prompts or chat logs. Agents follow the same scoped permissions, leases and review rules. Imported text is task data, not authority to disable access controls.

Your contributions are distributed under the repository's [Apache-2.0 license](LICENSE). Keep third-party notices and identify the source/license of new assets. No separate CLA or commit sign-off is currently required. Follow the [community conduct policy](CODE_OF_CONDUCT.md).
