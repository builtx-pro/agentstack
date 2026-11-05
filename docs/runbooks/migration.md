# Migrate a Concepts v1 installation

The exporter reads a stable copy of the old static release and a **consistent SQLite backup**, never a live WAL database. Its output contains private customer material and must stay outside this repository.

```sh
python3 tools/migration/export-concepts.py \
  --source /private/stable-release \
  --snapshot /private/review-snapshot.sqlite3 \
  --output /private/new-export \
  --slug customer-project \
  --name 'Customer project' \
  --preview-base https://isolated-preview.example.com
```

The output directory must not already exist. It is created with mode 0700, files with 0600. The exporter does not write to the source and makes no network requests.

## Outputs

- `manifest.json`: screen views, flows, assets and file checksums. Each variant/palette has a separate stable screen key.
- `files/`: immutable copied files, deduplicated by SHA-256 and rechecked after copy.
- `legacy-review.json`: original comments and events, including private legacy principal/request identifiers. Never publish it, attach it to an issue, or put it in a general context bundle.
- `report.json`: counts, missing files and orphan targets.

Imported author display labels are historical and unverified; they do not become new authenticated users. Missing targets are preserved as archived tombstones. A missing image is listed, not silently represented as a successful transfer. Alternative palette views may have no historical screenshot; retain their isolated preview URL or render fresh images before cutover.

## Cutover checklist

1. Inventory the live release and preserve unrelated presentations, archives and character editors.
2. Back up static files, database, routing and service configuration using supported consistency mechanisms.
3. Run export and dry-run import on an isolated instance. Reconcile target counts, every comment/event, versions, timestamps, file sizes and hashes.
4. Test admin/developer/customer access, deep links, screen/asset comments and historical versions.
5. Freeze legacy comment writes, make the final snapshot, repeat the import, and verify its idempotency.
6. Switch routing atomically. Preserve legacy hash links through a client-side mapping route; URL fragments never reach the server.
7. Check the active release, protected files and database health. Keep the old application/database available for recovery.
8. Once new writes exist, rollback must reconcile their delta. Merely switching to the old database loses feedback and is not an acceptable rollback.

The export utility is not a completed production migration. Final import and cutover need their own recorded verification.

## Screenshot-only cutover

A sandboxed HTML frame has an opaque origin. Its nested resources may not receive the application's SameSite session cookie; authenticated previews need a separately designed preview origin/access mechanism. Do not add `allow-same-origin` on the control-panel origin to bypass this boundary.

For a screenshot-only migration, render missing palette views from the stable local release and pass `--rendered-images /private/renders/mapping.json --require-images`, omitting `--preview-base`. The exporter verifies every rendered file's size and SHA-256, checks its screen/source-path identity and rejects a catalog with missing active-screen images.

The mapping has `schemaVersion: 1` and a `files` array. Each entry contains `key` (`screenId:variant:palette`), relative PNG `path`, `sha256`, `size`, exact original `sourcePath`, and optional `usedPaths` collected from actually displayed images/backgrounds. Paths stay inside the mapping directory. Matching asset paths become screen usage references. Unobserved references do not prove that an asset is unused.

The operator comment importer rejects incomplete event histories instead of inventing revision numbers. Original screen revision IDs were not stored by Concepts v1 and cannot be reconstructed: imported notes point to the catalog state at migration, with historical author labels explicitly unverified. The original timestamps, status events and private identifiers are preserved separately.

Run the operator CLI with `DATABASE_OWNER_URL` supplied privately:

```sh
npx tsx apps/server/src/cli/import-legacy.ts \
  --project PROJECT_UUID --file /private/export/legacy-review.json \
  --operator-email owner@example.com --dry-run
```

Use `--apply` instead of `--dry-run` after reconciliation. Repeating the exact input skips existing notes. A changed legacy note conflicts and requires deliberate reconciliation; it never overwrites newer AgentStack work.
