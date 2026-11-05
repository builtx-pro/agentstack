CREATE TABLE account_profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 locale text CHECK(locale IN ('ru','en')),
 theme text NOT NULL DEFAULT 'auto' CHECK(theme IN ('light','dark','auto')),
 accent text NOT NULL DEFAULT '#7950f2' CHECK(accent ~ '^#[0-9a-fA-F]{6}$'),
 onboarding_completed boolean NOT NULL DEFAULT false,
 avatar bytea CHECK(octet_length(avatar)<=524288),
 avatar_hash text,
 mfa_secret text,
 pending_secret text,
 pending_expires_at timestamptz,
 pending_user_version integer,
 pending_attempts integer NOT NULL DEFAULT 0 CHECK(pending_attempts>=0),
 last_counter bigint NOT NULL DEFAULT -1,
 recovery_hashes text[] NOT NULL DEFAULT '{}',
 security_version integer NOT NULL DEFAULT 1,
 failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts>=0),
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_challenges (
 hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 user_version integer NOT NULL,
 security_version integer NOT NULL,
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_challenges_user_idx ON account_challenges(user_id);
CREATE INDEX account_challenges_expiry_idx ON account_challenges(expires_at);
CREATE TABLE account_history (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 version integer NOT NULL,
 action text NOT NULL,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_history_user_idx ON account_history(user_id,created_at DESC,id DESC);
CREATE TRIGGER account_history_immutable BEFORE UPDATE OR DELETE ON account_history FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
ALTER TABLE sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX sessions_id_idx ON sessions(id);
ALTER TABLE account_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY account_profile_owner ON account_profiles TO agentstack_app USING(user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid) WITH CHECK(user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
ALTER TABLE account_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY account_challenge_owner ON account_challenges TO agentstack_app USING(user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid OR hash=current_setting('agentstack.challenge_hash',true)) WITH CHECK(user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
ALTER TABLE account_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_history FORCE ROW LEVEL SECURITY;
CREATE POLICY account_history_owner ON account_history FOR SELECT TO agentstack_app USING(user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
CREATE POLICY account_history_append ON account_history FOR INSERT TO agentstack_app WITH CHECK(user_id=nullif(current_setting('agentstack.user_id',true),'')::uuid);
INSERT INTO schema_migrations(version) VALUES(5);
