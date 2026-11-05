CREATE TABLE repository_connections (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES projects(id),
 provider text NOT NULL CHECK(provider IN ('github','gitlab','local')),
 repository text NOT NULL,
 branch text NOT NULL,
 label text NOT NULL,
 roots text[] NOT NULL,
 share_pipelines boolean NOT NULL DEFAULT false,
 credential_ciphertext text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 archived boolean NOT NULL DEFAULT false,
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,id)
);
CREATE INDEX repository_connections_project_idx ON repository_connections(project_id,id);
CREATE TABLE repository_snapshots (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL,
 connection_id uuid NOT NULL,
 config_version integer NOT NULL CHECK(config_version>0),
 branch text NOT NULL,
 commit_sha text NOT NULL,
 source text NOT NULL CHECK(source IN ('provider','reported')),
 drafts jsonb NOT NULL,
 pipelines jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,id),
 FOREIGN KEY(project_id,connection_id) REFERENCES repository_connections(project_id,id)
);
CREATE INDEX repository_snapshots_connection_idx ON repository_snapshots(project_id,connection_id,created_at DESC,id DESC);
CREATE TRIGGER repository_snapshots_immutable BEFORE UPDATE OR DELETE ON repository_snapshots FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TABLE repository_bindings (
 project_id uuid NOT NULL,
 connection_id uuid NOT NULL,
 source_key text NOT NULL,
 source_path text NOT NULL,
 object_id uuid NOT NULL,
 source_hash text NOT NULL,
 object_hash text NOT NULL,
 object_version integer NOT NULL CHECK(object_version>0),
 commit_sha text NOT NULL,
 snapshot_id uuid NOT NULL,
 PRIMARY KEY(project_id,connection_id,source_key),
 UNIQUE(project_id,object_id),
 FOREIGN KEY(project_id,connection_id) REFERENCES repository_connections(project_id,id),
 FOREIGN KEY(project_id,object_id) REFERENCES objects(project_id,id),
 FOREIGN KEY(project_id,snapshot_id) REFERENCES repository_snapshots(project_id,id)
);
CREATE INDEX repository_bindings_object_idx ON repository_bindings(project_id,object_id);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['repository_connections','repository_snapshots','repository_bindings'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY tenant_access ON %I TO agentstack_app USING(project_id=nullif(current_setting(''agentstack.project_id'',true),'''')::uuid) WITH CHECK(project_id=nullif(current_setting(''agentstack.project_id'',true),'''')::uuid)',t);
END LOOP;END $$;
INSERT INTO schema_migrations(version) VALUES(4);
