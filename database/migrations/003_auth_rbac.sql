-- Ciclo de vida de contas, sessões administráveis e tokens de uso único.
ALTER TABLE relic.users ADD COLUMN status text;
UPDATE relic.users SET status = CASE WHEN active THEN 'ACTIVE' ELSE 'SUSPENDED' END;
ALTER TABLE relic.users ALTER COLUMN status SET NOT NULL;
ALTER TABLE relic.users ALTER COLUMN status SET DEFAULT 'ACTIVE';
ALTER TABLE relic.users ADD CONSTRAINT users_status_check CHECK(status IN ('PENDING','ACTIVE','SUSPENDED'));
ALTER TABLE relic.users ADD COLUMN invited_at timestamptz;
ALTER TABLE relic.users ADD COLUMN activated_at timestamptz;
ALTER TABLE relic.users ADD COLUMN last_login_at timestamptz;
ALTER TABLE relic.users ADD COLUMN password_changed_at timestamptz;
UPDATE relic.users
SET activated_at = created_at,
    password_changed_at = created_at
WHERE status = 'ACTIVE';
ALTER TABLE relic.users ADD CONSTRAINT users_status_active_consistency CHECK((status = 'ACTIVE') = active);

CREATE FUNCTION relic.sync_user_status_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.active = NEW.status = 'ACTIVE';
  RETURN NEW;
END $$;
CREATE TRIGGER users_status_sync
BEFORE INSERT OR UPDATE OF status ON relic.users
FOR EACH ROW EXECUTE FUNCTION relic.sync_user_status_active();

ALTER TABLE relic.sessions ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE relic.sessions ADD CONSTRAINT sessions_id_unique UNIQUE(id);
ALTER TABLE relic.sessions ADD COLUMN user_agent text NOT NULL DEFAULT '';
ALTER TABLE relic.sessions ADD COLUMN ip_address text NOT NULL DEFAULT '';
ALTER TABLE relic.sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX sessions_user_created_idx ON relic.sessions(user_id,created_at DESC);

CREATE TABLE relic.auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES relic.users(id),
  purpose text NOT NULL CHECK(purpose IN ('INVITE','RESET')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES relic.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(expires_at > created_at)
);
CREATE INDEX auth_tokens_user_purpose_idx ON relic.auth_tokens(user_id,purpose,created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'relic_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON relic.auth_tokens TO relic_runtime';
  END IF;
END;
$$;
