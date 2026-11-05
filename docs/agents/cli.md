# CLI reference

Run from a built checkout: `node packages/cli/dist/main.js --help`. The CLI uses the same authenticated API as MCP. Supply `AGENTSTACK_URL`, `AGENTSTACK_TOKEN` and optionally `AGENTSTACK_PROJECT` through your environment. `--project <UUID>` overrides the project default; `--url` overrides the origin. Tokens have no command-line flag.

```sh
node packages/cli/dist/main.js doctor --json
node packages/cli/dist/main.js projects --json
node packages/cli/dist/main.js --project PROJECT_UUID context --markdown --output context.md
node packages/cli/dist/main.js --project PROJECT_UUID objects list --kind screen --q recovery --json
node packages/cli/dist/main.js --project PROJECT_UUID objects list --kind asset --tag illustration --json
node packages/cli/dist/main.js --project PROJECT_UUID objects get OBJECT_UUID --json
node packages/cli/dist/main.js --project PROJECT_UUID notes list --status open --json
node packages/cli/dist/main.js --project PROJECT_UUID claim NOTE_UUID --version 1 --json
node packages/cli/dist/main.js --project PROJECT_UUID submit NOTE_UUID result.json --version 2 --json
node packages/cli/dist/main.js --project PROJECT_UUID release NOTE_UUID --version 2 --reason "Blocked by missing source" --json
node packages/cli/dist/main.js --project PROJECT_UUID history OBJECT_UUID --json
node packages/cli/dist/main.js --project PROJECT_UUID history NOTE_UUID --note --json
node packages/cli/dist/main.js --project PROJECT_UUID progress --json
```

Replace uppercase UUID placeholders with actual identifiers. Note version and target version are different values. Always use the returned version after a mutation.

`result.json`:

```json
{
  "summary": "Clarified the recovery action and checked navigation.",
  "revision": "your-actual-commit-sha",
  "checks": [
    { "name": "Recovery flow in browser", "result": "passed", "details": "Checked the changed button and destination." },
    { "name": "Production release", "result": "not_run", "details": "This change is local only." }
  ]
}
```

The sample describes the format, not tests that were run for your project. Replace every result with actual evidence.

Create/update use JSON files matching the API contract. `objects create` and `notes create` accept `--request-id UUID` for safe retry. `objects update` requires `expectedVersion` in the input. Rules and completed statuses remain server-restricted for agent tokens. There is intentionally no CLI command to accept a result using an agent token.

`--json` emits machine JSON on stdout. Errors and upload-reconciliation warnings go to stderr; failure exits nonzero. Output files are created exclusively with owner-only permissions; an existing path is never silently overwritten.

## Request timeouts

`--timeout-ms <milliseconds>` is a global option for both agent-token commands and explicit human imports. It defaults to 30000 and accepts integers from 1 to 600000. For a large catalog, for example:

```sh
node packages/cli/dist/main.js --timeout-ms 300000 --project PROJECT_UUID import /private/export/manifest.json \
  --human --email owner@example.com --password-stdin --apply < /private/operator-password
```

The value applies to each request, not the entire command. Human login remains capped at 30000 ms. The SDK's `createHumanSession` accepts the same optional `timeoutMs` and passes it to its authenticated client.

A timeout can happen after the server commits an import. The CLI never automatically retries an uncertain mutation or rolls it back. Read the current catalog and reconcile the result before retrying; retain the reported uploaded file IDs for investigation.

## Repository connections and CI

Use `repositories list/get/pipelines/snapshots/snapshot` to inspect connections and staged changes. `repositories sync CONNECTION --repo DIR` previews committed HEAD; add `--stage` to submit it for human review. `repositories refresh CONNECTION` reads a configured GitHub/GitLab branch and stages provider data. Neither command applies changes. Use global `--project PROJECT --timeout-ms 120000` for provider refresh. See [repository sync, limits and CI templates](repository-sync.md).

## Human imports with two-factor authentication

For an enrolled human account, add `--mfa-stdin` together with `--human --email you@example.com --password-stdin`. Redirect a protected file with exactly two lines: password, then a current authenticator or unused recovery code. The code is not accepted as a command-line argument. Do not commit this file; remove it after the operation. SDK callers can supply the ephemeral `mfaCode` option to `createHumanSession`. Without a code, the client reports `mfa_required` and does not create a session. MCP continues using scoped agent tokens and never asks for a human password or factor.
