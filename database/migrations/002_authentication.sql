CREATE TABLE imovelink.user_credentials (
    user_id TEXT PRIMARY KEY REFERENCES imovelink.users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE imovelink.auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES imovelink.users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('SESSION', 'REMEMBER')),
    parent_hash TEXT REFERENCES imovelink.auth_sessions(token_hash) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (kind <> 'REMEMBER' OR parent_hash IS NULL)
);
CREATE INDEX auth_sessions_user ON imovelink.auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON imovelink.auth_sessions(expires_at);
CREATE TABLE imovelink.auth_attempts (
    bucket_hash TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
REVOKE ALL ON ALL TABLES IN SCHEMA imovelink FROM PUBLIC;
