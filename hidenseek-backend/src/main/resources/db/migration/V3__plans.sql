-- Subscription plans with a daily data allowance. A user without a plan (or whose plan expired) is
-- on the default plan. Upgrades are requested by the user and approved by an admin.
CREATE TABLE hs_plans (
    id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
    code               VARCHAR(32)  NOT NULL,
    name               VARCHAR(64)  NOT NULL,
    description        VARCHAR(255),
    -- NULL = unlimited
    daily_limit_bytes  BIGINT,
    price_label        VARCHAR(64),
    sort_order         INT          NOT NULL,
    is_default         BOOLEAN      NOT NULL,
    CONSTRAINT uk_hs_plans_code UNIQUE (code)
);

INSERT INTO hs_plans (id, code, name, description, daily_limit_bytes, price_label, sort_order, is_default) VALUES
    ('free', 'FREE', 'Free', 'For light browsing and messaging.', 2147483648, 'Free', 1, TRUE),
    ('plus', 'PLUS', 'Plus', 'Streaming and video calls every day.', 21474836480, NULL, 2, FALSE),
    ('pro',  'PRO',  'Pro',  'No daily limit.', NULL, NULL, 3, FALSE);

ALTER TABLE hs_users ADD COLUMN plan_id VARCHAR(36);
ALTER TABLE hs_users ADD COLUMN plan_expires_at DATETIME(6);
ALTER TABLE hs_users ADD CONSTRAINT fk_hs_users_plan FOREIGN KEY (plan_id) REFERENCES hs_plans (id);

CREATE TABLE hs_plan_requests (
    id             VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id        VARCHAR(36)  NOT NULL,
    plan_id        VARCHAR(36)  NOT NULL,
    status         VARCHAR(16)  NOT NULL,
    note           VARCHAR(500),
    created_at     DATETIME(6)  NOT NULL,
    decided_at     DATETIME(6),
    decided_by     VARCHAR(320),
    decision_note  VARCHAR(500),
    CONSTRAINT fk_hs_plan_requests_user FOREIGN KEY (user_id) REFERENCES hs_users (id) ON DELETE CASCADE,
    CONSTRAINT fk_hs_plan_requests_plan FOREIGN KEY (plan_id) REFERENCES hs_plans (id)
);
CREATE INDEX ix_hs_plan_requests_status ON hs_plan_requests (status, created_at);

-- Bytes through the tunnel (both directions) per user per day, in the plans' timezone.
CREATE TABLE hs_daily_usage (
    user_id     VARCHAR(36) NOT NULL,
    usage_date  DATE        NOT NULL,
    used_bytes  BIGINT      NOT NULL,
    PRIMARY KEY (user_id, usage_date),
    CONSTRAINT fk_hs_daily_usage_user FOREIGN KEY (user_id) REFERENCES hs_users (id) ON DELETE CASCADE
);
