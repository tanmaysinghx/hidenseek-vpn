-- Hidenseek VPN schema. Portable between MySQL 8 and H2 (MySQL mode) for tests.

CREATE TABLE hs_users (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    subject       VARCHAR(255) NOT NULL,
    email         VARCHAR(320) NOT NULL,
    display_name  VARCHAR(255),
    role          VARCHAR(16)  NOT NULL,
    status        VARCHAR(16)  NOT NULL,
    created_at    DATETIME(6)  NOT NULL,
    last_seen_at  DATETIME(6),
    CONSTRAINT uk_hs_users_subject UNIQUE (subject),
    CONSTRAINT uk_hs_users_email UNIQUE (email)
);

CREATE TABLE hs_nodes (
    id                     VARCHAR(36)  NOT NULL PRIMARY KEY,
    name                   VARCHAR(100) NOT NULL,
    country_code           VARCHAR(2)      NOT NULL,
    city                   VARCHAR(100),
    endpoint_host          VARCHAR(255),
    listen_port            INT          NOT NULL,
    public_key             VARCHAR(64),
    address_cidr           VARCHAR(43)  NOT NULL,
    dns                    VARCHAR(255) NOT NULL,
    status                 VARCHAR(16)  NOT NULL,
    enabled                BOOLEAN      NOT NULL,
    activity_logging       BOOLEAN      NOT NULL,
    enrollment_token_hash  VARCHAR(64),
    enrollment_expires_at  DATETIME(6),
    agent_token_hash       VARCHAR(64),
    agent_version          VARCHAR(32),
    last_heartbeat_at      DATETIME(6),
    created_at             DATETIME(6)  NOT NULL,
    CONSTRAINT uk_hs_nodes_name UNIQUE (name),
    CONSTRAINT uk_hs_nodes_enrollment UNIQUE (enrollment_token_hash),
    CONSTRAINT uk_hs_nodes_agent UNIQUE (agent_token_hash)
);

CREATE TABLE hs_devices (
    id           VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id      VARCHAR(36)  NOT NULL,
    name         VARCHAR(100) NOT NULL,
    platform     VARCHAR(16)  NOT NULL,
    public_key   VARCHAR(64)  NOT NULL,
    created_at   DATETIME(6)  NOT NULL,
    revoked_at   DATETIME(6),
    CONSTRAINT uk_hs_devices_key UNIQUE (public_key),
    CONSTRAINT fk_hs_devices_user FOREIGN KEY (user_id) REFERENCES hs_users (id)
);

-- One row per (device, node): the device's tunnel address on that node.
CREATE TABLE hs_peers (
    id            VARCHAR(36) NOT NULL PRIMARY KEY,
    device_id     VARCHAR(36) NOT NULL,
    node_id       VARCHAR(36) NOT NULL,
    address       VARCHAR(39) NOT NULL,
    last_rx_bytes BIGINT      NOT NULL,
    last_tx_bytes BIGINT      NOT NULL,
    created_at    DATETIME(6) NOT NULL,
    CONSTRAINT uk_hs_peers_device_node UNIQUE (device_id, node_id),
    CONSTRAINT uk_hs_peers_node_address UNIQUE (node_id, address),
    CONSTRAINT fk_hs_peers_device FOREIGN KEY (device_id) REFERENCES hs_devices (id),
    CONSTRAINT fk_hs_peers_node FOREIGN KEY (node_id) REFERENCES hs_nodes (id)
);

CREATE TABLE hs_sessions (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    peer_id       VARCHAR(36)  NOT NULL,
    user_id       VARCHAR(36)  NOT NULL,
    device_id     VARCHAR(36)  NOT NULL,
    node_id       VARCHAR(36)  NOT NULL,
    user_email    VARCHAR(320) NOT NULL,
    client_ip     VARCHAR(45)  NOT NULL,
    country_code  VARCHAR(2),
    country       VARCHAR(100),
    region        VARCHAR(100),
    city          VARCHAR(100),
    started_at    DATETIME(6)  NOT NULL,
    last_seen_at  DATETIME(6)  NOT NULL,
    ended_at      DATETIME(6),
    rx_bytes      BIGINT       NOT NULL,
    tx_bytes      BIGINT       NOT NULL,
    CONSTRAINT fk_hs_sessions_peer FOREIGN KEY (peer_id) REFERENCES hs_peers (id),
    CONSTRAINT fk_hs_sessions_user FOREIGN KEY (user_id) REFERENCES hs_users (id),
    CONSTRAINT fk_hs_sessions_node FOREIGN KEY (node_id) REFERENCES hs_nodes (id)
);
CREATE INDEX ix_hs_sessions_open ON hs_sessions (peer_id, ended_at);
CREATE INDEX ix_hs_sessions_user ON hs_sessions (user_id, started_at);
CREATE INDEX ix_hs_sessions_started ON hs_sessions (started_at);

-- Raw activity: DNS lookups seen by the node resolver. Only written for nodes with
-- activity_logging enabled, and purged after hidenseek.activity.retention.
CREATE TABLE hs_activity (
    id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id   VARCHAR(36),
    user_id      VARCHAR(36)  NOT NULL,
    node_id      VARCHAR(36)  NOT NULL,
    domain       VARCHAR(253) NOT NULL,
    query_type   VARCHAR(10)  NOT NULL,
    occurred_at  DATETIME(6)  NOT NULL
);
CREATE INDEX ix_hs_activity_user ON hs_activity (user_id, occurred_at);
CREATE INDEX ix_hs_activity_session ON hs_activity (session_id);
CREATE INDEX ix_hs_activity_occurred ON hs_activity (occurred_at);
