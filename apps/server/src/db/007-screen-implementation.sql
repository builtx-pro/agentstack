-- Legacy readers keep the original screen data shape. A rollback retains evidence in-place.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='objects' AND column_name='retained_screen_metadata_v7') THEN
    ALTER TABLE objects RENAME COLUMN retained_screen_metadata_v7 TO screen_metadata;
  ELSE
    ALTER TABLE objects ADD COLUMN screen_metadata jsonb
      CHECK (screen_metadata IS NULL OR (kind = 'screen' AND jsonb_typeof(screen_metadata) = 'object'));
  END IF;
END $$;
INSERT INTO schema_migrations(version) VALUES (7);
