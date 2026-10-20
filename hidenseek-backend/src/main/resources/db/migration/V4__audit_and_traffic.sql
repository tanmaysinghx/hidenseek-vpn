-- Server-side request audit: who called which API, from where, and how it went.
CREATE TABLE hs_audit_log (
    id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    occurred_at   DATETIME(6)  NOT NULL,
    -- The day in the plans' timezone, so per-day stats group the same way on MySQL and H2.
    occurred_day  DATE         NOT NULL,
    user_email    VARCHAR(320),
    method        VARCHAR(8)   NOT NULL,
    path          VARCHAR(255) NOT NULL,
    -- path with ids replaced by {id}, for grouping
    route         VARCHAR(255) NOT NULL,
    status        INT          NOT NULL,
    duration_ms   INT          NOT NULL,
    -- APP, WEB or OTHER, from the User-Agent
    client        VARCHAR(16)  NOT NULL,
    ip            VARCHAR(45),
    country_code  VARCHAR(2),
    country       VARCHAR(64),
    region        VARCHAR(64),
    city          VARCHAR(64),
    referrer      VARCHAR(512),
    user_agent    VARCHAR(255)
);
CREATE INDEX ix_hs_audit_log_time ON hs_audit_log (occurred_at);
CREATE INDEX ix_hs_audit_log_user ON hs_audit_log (user_email, occurred_at);

-- Page views reported by the web console: where visitors came from and what they looked at.
CREATE TABLE hs_traffic_events (
    id             BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    occurred_at    DATETIME(6)  NOT NULL,
    occurred_day   DATE         NOT NULL,
    -- random per browser (localStorage) / per tab session (sessionStorage); no cookies
    visitor_id     VARCHAR(36)  NOT NULL,
    session_id     VARCHAR(36)  NOT NULL,
    user_email     VARCHAR(320),
    -- LANDING (first page of a session) or PAGEVIEW (in-app navigation)
    type           VARCHAR(16)  NOT NULL,
    path           VARCHAR(255) NOT NULL,
    referrer       VARCHAR(512),
    -- Direct, a referring host, or the utm_source
    source         VARCHAR(255) NOT NULL,
    utm_source     VARCHAR(100),
    utm_medium     VARCHAR(100),
    utm_campaign   VARCHAR(100),
    device         VARCHAR(16)  NOT NULL,
    ip             VARCHAR(45),
    country_code   VARCHAR(2),
    country        VARCHAR(64),
    region         VARCHAR(64),
    user_agent     VARCHAR(255)
);
CREATE INDEX ix_hs_traffic_events_time ON hs_traffic_events (occurred_at);
