# Backup, restore and upgrades

Database rows, immutable files and the **matching encryption configuration** are one recovery set. Files must not be garbage-collected during backup. Dump the database first, then archive file storage; new uploads after the dump are harmless extras. Store an encrypted copy off the application server.

## Back up an installer-managed VPS

The installer keeps `.env` outside its source checkout. Use its installation directory explicitly:

```sh
sudo bash /opt/agentstack/source/tools/ops/backup.sh \
  /private/backups/new-release-backup --installation /opt/agentstack
sudo python3 /opt/agentstack/source/tools/ops/verify-backup.py \
  /private/backups/new-release-backup
```

This selects `/opt/agentstack/.env`, the source checkout and both base/VPS Compose files. It includes the protected configuration, Compose files and Caddyfile in the checksummed backup. It never infers credentials from the caller's current directory.

## Back up a manual deployment

```sh
bash /checkout/tools/ops/backup.sh /private/backups/new-release-backup \
  --source /checkout --env-file /private/deployment/.env \
  --project-name agentstack --compose-file /checkout/compose.yaml
python3 /checkout/tools/ops/verify-backup.py /private/backups/new-release-backup
```

Repeat `--compose-file` for overlays. Running from a conventional checkout without these options uses its `.env` and base Compose file. The destination must be new and outside the source checkout.

`deployment.env` is mandatory, private (`0600`) and checked against the running application's encryption-key fingerprints before and after the backup. A missing, malformed or mismatched key aborts instead of claiming a recoverable backup. Key values are never printed. The backup includes the complete configuration, not only fingerprints. A failed backup has no successful checksum verification; preserve it for diagnosis, then create a new backup directory after correcting the issue.

Protect `REPOSITORY_ENCRYPTION_KEY` and any separately configured `ACCOUNT_ENCRYPTION_KEY`. Losing or replacing an encryption key can make stored provider credentials and MFA secrets unreadable. Never regenerate these keys during an upgrade or restore. Legacy backups without `deployment.env` need their original matching key recovered separately before they are usable; verification intentionally rejects an incomplete recovery set.

Directory permissions are not encryption. Do not put backups in Git, public object storage or issue attachments. Caddy certificate volumes should also be backed up separately for continuity; they are not required to decrypt application records and can be renewed through ACME on a replacement host.

## Restore rehearsal into an empty installation

Use a separate checkout, Compose project name, loopback port and empty volumes. Never test restoration against a running customer instance.

1. Verify checksums and archive paths with the helper above. Restore configuration from the verified `deployment.env` to a private `0600` file. **Preserve the exact encryption-key values.** Do not run the new-install secret generator over restored configuration. Fresh database passwords are optional for the new cluster; they are distinct from encryption keys and must agree between the database/migration/app services.
2. Adjust only environment-specific paths, hostname, loopback port and proxy settings for the rehearsal. Keep the production proxy stopped and do not publish the rehearsal to the internet. Use an explicit Compose helper pointing at this restored environment for every following command:

   ```sh
   rehearsal_compose() {
     docker compose --project-directory /private/rehearsal/source \
       --env-file /private/rehearsal/deployment.env \
       -p agentstack-restore-test -f /private/rehearsal/source/compose.yaml "$@"
   }
   ```

3. Start only `rehearsal_compose up -d database`. Confirm the new database's `public` schema contains no application tables.
4. Create the policy role before restoring; cluster roles are not included in `pg_dump`: `rehearsal_compose exec -T database psql -U postgres -d agentstack -v ON_ERROR_STOP=1 -c 'CREATE ROLE agentstack_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT'`. This is for the verified empty cluster only.
5. Restore with `rehearsal_compose exec -T database pg_restore -U postgres -d agentstack --no-owner --no-acl --exit-on-error < /private/backup/database.dump`.
6. Run `rehearsal_compose run --rm migrate` using the restored configuration. It establishes the restricted application role and applies compatible pending migrations. Use the recorded source revision or a deliberately compatible successor.
7. Restore the verified file archive into the new `files` volume with an operator one-shot container: `rehearsal_compose run --rm -T --no-deps --user 0 app tar -C /data/files -xzf - < /private/backup/files.tar.gz`. Verify runtime-user ownership. Do not enable public traffic yet.
8. Start the app and verify readiness, object/revision/comment/file counts, representative file hashes, history and role isolation. Test an existing MFA-protected login with a legitimate factor and a private repository credential read where available; readiness alone does not prove that encrypted records can be decrypted.
9. Record the result. Remove only the isolated rehearsal resources after confirming the original installation is unaffected. Keep the recovery set encrypted off-host.

## Upgrade

Back up first. Build an immutable image/revision, read its migration notes, apply compatible migrations, switch the application, and verify real reads/writes. Keep the previous image and recovery set. Preserve encryption keys and do not run two versions against an incompatible schema.

Rollback after new writes is a data-reconciliation decision, not just an image switch. Restoring an old database would discard those writes. Prefer a forward fix or export/reconcile the delta. Never reset the database volume to make an upgrade pass.
