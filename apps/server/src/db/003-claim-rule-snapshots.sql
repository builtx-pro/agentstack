-- NULL explicitly means no recorded snapshot. Do not invent historical rule versions.
ALTER TABLE notes ADD COLUMN claimed_rule_revisions jsonb
  CHECK (claimed_rule_revisions IS NULL OR jsonb_typeof(claimed_rule_revisions)='array');
INSERT INTO schema_migrations(version) VALUES(3);
