CREATE TABLE personal_tasks (
 owner_id uuid NOT NULL REFERENCES users(id),
 id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 240),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=8000),
 status text NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','ready','in_progress','review','done')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent')),
 blocked boolean NOT NULL DEFAULT false,
 checklist jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(checklist)='array'),
 tags text[] NOT NULL DEFAULT '{}',
 archived boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 creation_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner_id,id)
);
CREATE INDEX personal_tasks_status_idx ON personal_tasks(owner_id,archived,status,id);
CREATE TABLE personal_task_history (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL,
 task_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>0),
 action text NOT NULL,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,task_id,version),
 FOREIGN KEY(owner_id,task_id) REFERENCES personal_tasks(owner_id,id)
);
CREATE TRIGGER personal_task_history_immutable BEFORE UPDATE OR DELETE ON personal_task_history FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
ALTER TABLE personal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY personal_task_owner ON personal_tasks TO agentstack_app USING(owner_id=nullif(current_setting('agentstack.user_id',true),'')::uuid) WITH CHECK(owner_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
ALTER TABLE personal_task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_task_history FORCE ROW LEVEL SECURITY;
CREATE POLICY personal_task_history_owner ON personal_task_history FOR SELECT TO agentstack_app USING(owner_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
CREATE POLICY personal_task_history_append ON personal_task_history FOR INSERT TO agentstack_app WITH CHECK(owner_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
-- A transaction-local opt-in permits only the signed-in user's assigned stories.
-- It is set solely by the human-only personal board service. Project writes and
-- history remain under the existing project policy, without a cross-project bypass.
CREATE POLICY assigned_story_board_read ON objects FOR SELECT TO agentstack_app USING(
 current_setting('agentstack.personal_board',true)='true'
 AND kind='story'
 AND data->>'assigneeId'=current_setting('agentstack.user_id',true)
 AND (
  current_setting('agentstack.is_admin',true)='true'
  OR EXISTS(SELECT 1 FROM memberships m WHERE m.project_id=objects.project_id AND m.user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid AND m.revoked_at IS NULL AND (m.role='developer' OR objects.visibility='customer'))
 )
);
CREATE INDEX objects_assigned_story_idx ON objects((data->>'assigneeId'),id) WHERE kind='story';
ALTER TABLE account_profiles ALTER COLUMN accent SET DEFAULT '#d9480f';
INSERT INTO schema_migrations(version) VALUES(6);
