# Backup, restore and upgrades

Database rows and files belong to one recovery set. Files are immutable and must not be garbage-collected during a backup. First dump the database, then archive its file storage; new uploads after the dump are harmless extras. Store an encrypted copy off the application server.

```sh
bash tools/ops/backup.sh /private/backups/new-release-backup
python3 tools/ops/verify-backup.py /private/backups/new-release-backup
```

The backup contains credentials if a deployment `.env` exists. Directory permissions alone are not encryption. Do not put it in Git or an issue attachment.

## Restore rehearsal into an empty installation

Use a separate checkout, Compose project name, port, volumes and fresh generated configuration. Never test these commands against a running customer instance.

1. Verify checksums and archive paths using the helper above.
2. Start only the new `database` service. Confirm its `public` schema contains no application tables.
3. Create the role named by row-security policies before restoring. A cluster role is not included in `pg_dump`: `docker compose exec -T database psql -U postgres -d agentstack -v ON_ERROR_STOP=1 -c 'CREATE ROLE agentstack_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT'`. This is for the verified empty installation only.
4. Restore the dump using `docker compose exec -T database pg_restore -U postgres -d agentstack --no-owner --no-acl --exit-on-error < /private/backup/database.dump`.
5. Run the migration service with the new deployment credentials. It establishes the restricted application role and applies compatible pending migrations.
6. Restore verified files into the new `files` volume using a one-shot app container. Do not enable public traffic yet.
7. Start the new app, verify readiness, log in and check object/revision/comment/file counts, representative file hashes, history and role isolation.
8. Record the result. Delete the rehearsal resources only after the original instance is verified unaffected.

## Upgrade

Back up first. Build an immutable image/revision, read its migration notes, apply compatible migrations, switch the application, and verify real reads/writes. Keep the previous image and recovery set. Do not run two application versions against an incompatible schema.

Rollback after new writes is a data reconciliation decision, not just an image switch. Restoring an old database would discard those writes. Prefer a forward fix or export/reconcile the delta. Never reset the database volume to make an upgrade pass.
