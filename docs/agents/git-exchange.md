# Explicit Git exchange

AgentStack stores the live collaboration state in its database. Git remains the source repository and an explicit exchange format, not an automatic second writer.

```sh
node packages/cli/dist/main.js --project PROJECT_UUID export --git /path/to/source --output project-manifest.json
node packages/cli/dist/main.js --project PROJECT_UUID import project-manifest.json --git /path/to/source --json
node packages/cli/dist/main.js --project PROJECT_UUID import project-manifest.json --apply --json
```

The first import is a dry run. It verifies declared local files and asks the server to validate the full batch without mutations. `--apply` repeats the dry run, uploads verified files and then submits an atomic object batch. Concurrent edits between dry-run and apply still cause version conflicts. There is no force flag.

The export contains active object metadata, stable `@key` relationships and `baseVersion`. It does not download file blobs and is not an installation backup. Existing UUID file references work only in the same installation; a portable package must supply declared files and `@file:key` references. Use the operator backup procedure for complete historical recovery.

The optional Git attachment reads the real commit SHA and branch using fixed `git` argv. It never invokes scripts from the repository, parses shell from comments, pushes, commits or changes worktrees. Detached worktrees have a commit without a branch. No remote URLs or local absolute paths are sent to AgentStack.

## Manifest

```json
{
  "schemaVersion": 1,
  "project": { "name": "Sample app", "slug": "sample-app" },
  "objects": [
    { "key": "recovery:main:light", "kind": "screen", "title": "Recover access", "data": { "screenId": "recovery", "variant": "main", "palette": "light", "imageFileId": "@file:recovery-image" } },
    { "key": "flow:recovery", "kind": "flow", "title": "Lost second factor", "data": { "screenIds": ["@recovery:main:light"] } }
  ],
  "files": []
}
```

The illustrative image reference above must be backed by a real file declaration before import; use the complete synthetic examples for a runnable package. A file declaration has `key`, relative `path`, lowercase SHA-256 `sha256`, integer `size` and `mimeType`. The CLI rejects missing files, traversal, absolute paths, symlinks, duplicate file keys and mismatched hashes/sizes before uploading. The server detects MIME from bytes and remains authoritative about accepted types. Local paths are removed before sending the manifest.

Use `baseVersion` when updating an existing key. `@key` points to another object in the batch; the API resolves references transactionally. Agent tokens cannot use import to rewrite rules or accept completed work.

Limits are explicit: at most 12,000 objects in the CLI schema, a 32 MiB manifest input, a 2 GiB aggregate local-file default, and a 12 MiB per-file upload. `--max-total-bytes` can raise the aggregate limit up to 50 GiB for a deliberate migration. Server limits may be smaller and fail the request. Nothing is silently truncated or split into partially applied object batches.

If file upload or final import fails, stderr reports the successfully uploaded file IDs. They may be unreferenced and need operator reconciliation; the CLI does not delete unknown server files. Uploaded files never confer customer access by themselves.

## Explicit human onboarding

A starter can contain active rules and already-completed sample stories, which agent tokens deliberately cannot import. An operator may use a short-lived human session for this explicit operation:

```sh
node packages/cli/dist/main.js --project PROJECT_UUID import examples/starter/manifest.json --human --email you@example.test --password-stdin --apply < /path/to/protected-password-file
```

Use a protected input source or pipe from your secret manager; do not put the password directly on the command line or commit the file. The CLI requires noninteractive stdin, stores its cookie only in process memory, sends the exact Origin and CSRF header, and logs out in `finally` even when import fails. If logout itself fails, the command warns on stderr and exits nonzero. This mode is confined to the explicit import command and is never offered through MCP. It does not turn agent tokens into human credentials.
