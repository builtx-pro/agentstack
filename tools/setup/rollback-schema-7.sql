-- Stop the schema-7 writer before running this as the migration owner.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('agentstack-migrations'));
DO $$
BEGIN
  IF (SELECT max(version) FROM schema_migrations) IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'This rollback requires schema version 7';
  END IF;
END $$;
ALTER TABLE objects RENAME COLUMN screen_metadata TO retained_screen_metadata_v7;
DELETE FROM schema_migrations WHERE version=7;
COMMIT;
