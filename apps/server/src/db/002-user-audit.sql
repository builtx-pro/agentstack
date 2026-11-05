ALTER TABLE users ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
CREATE TABLE installation_admin_audit (
 id uuid PRIMARY KEY,
 actor_id uuid REFERENCES users(id),
 actor_name text NOT NULL,
 source text NOT NULL CHECK(source IN ('web','bootstrap','invitation','migration')),
 action text NOT NULL,
 target_id uuid NOT NULL REFERENCES users(id),
 target_version integer NOT NULL CHECK(target_version>0),
 before_snapshot jsonb,
 after_snapshot jsonb NOT NULL,
 changes text[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX installation_admin_audit_target_idx ON installation_admin_audit(target_id,target_version DESC);
CREATE INDEX installation_admin_audit_date_idx ON installation_admin_audit(created_at DESC,id DESC);
CREATE TRIGGER installation_admin_audit_immutable BEFORE UPDATE OR DELETE ON installation_admin_audit FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
ALTER TABLE installation_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE installation_admin_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY installation_admin_audit_read ON installation_admin_audit FOR SELECT USING(current_setting('agentstack.is_admin',true)='true');
CREATE POLICY installation_admin_audit_append ON installation_admin_audit FOR INSERT WITH CHECK(actor_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
-- Existing installations get an explicitly labelled baseline, not invented prior history.
INSERT INTO installation_admin_audit(id,actor_id,actor_name,source,action,target_id,target_version,after_snapshot,changes)
 SELECT gen_random_uuid(),NULL,'Migration','migration','user.baseline',id,version,
 jsonb_build_object('id',id,'email',email,'name',name,'isAdmin',is_admin,'disabled',disabled,'version',version),ARRAY['baseline'] FROM users;
INSERT INTO schema_migrations(version) VALUES(2);
ALTER TABLE memberships ADD COLUMN revoked_at timestamptz;
ALTER POLICY project_access ON projects USING (current_setting('agentstack.is_admin',true)='true' OR EXISTS(SELECT 1 FROM memberships m WHERE m.project_id=projects.id AND m.user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid AND m.revoked_at IS NULL));
DO $$ DECLARE p record; BEGIN FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' LOOP EXECUTE format('ALTER POLICY %I ON %I.%I TO agentstack_app',p.policyname,p.schemaname,p.tablename);END LOOP;END $$;

CREATE INDEX files_content_lookup_idx ON files(project_id,sha256,size,mime_type);
CREATE TABLE legacy_links (
 project_id uuid NOT NULL REFERENCES projects(id),
 source text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('comment','event')),
 legacy_id text NOT NULL,
 target_id uuid NOT NULL,
 note_id uuid NOT NULL,
 PRIMARY KEY(project_id,source,kind,legacy_id),
 FOREIGN KEY(project_id,target_id) REFERENCES objects(project_id,id),
 FOREIGN KEY(project_id,note_id) REFERENCES notes(project_id,id)
);
ALTER TABLE legacy_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_links FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON legacy_links TO agentstack_app USING(project_id=nullif(current_setting('agentstack.project_id',true),'')::uuid) WITH CHECK(project_id=nullif(current_setting('agentstack.project_id',true),'')::uuid);
