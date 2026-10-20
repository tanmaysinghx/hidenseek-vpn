-- Sessions of the native apps' email/password sign-in. Portal verifies the password; the backend
-- issues its own short access tokens and these rotating 30-day refresh tokens (stored hashed).
CREATE TABLE hs_app_sessions (
    id                  VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id             VARCHAR(36)  NOT NULL,
    refresh_token_hash  VARCHAR(64)  NOT NULL,
    roles               VARCHAR(255) NOT NULL,
    device_name         VARCHAR(100),
    created_at          DATETIME(6)  NOT NULL,
    last_used_at        DATETIME(6)  NOT NULL,
    expires_at          DATETIME(6)  NOT NULL,
    revoked_at          DATETIME(6),
    CONSTRAINT uk_hs_app_sessions_token UNIQUE (refresh_token_hash),
    CONSTRAINT fk_hs_app_sessions_user FOREIGN KEY (user_id) REFERENCES hs_users (id)
);
CREATE INDEX ix_hs_app_sessions_user ON hs_app_sessions (user_id);
