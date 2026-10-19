# Architecture

## Components

**Backend** (`hidenseek-backend`) is the source of truth. It is a stateless Spring Boot service and keeps everything in MySQL. It has two kinds of callers:

- **Apps**, authenticated with Portal SSO access tokens (RS256 JWTs verified against Portal's JWKS, checking `iss` and `aud`). Users are created on their first request from the token's `sub`, `email` and `name`. `roles: [ROLE_ADMIN]` or `ADMIN_EMAILS` grants admin.
- **Agents**, authenticated with an opaque `hsn_agent_…` token issued at enrollment. Only its SHA-256 is stored.

**Agent** (`hidenseek-agent`) runs as a systemd service on each VPS:

| Loop | Interval | Does |
|---|---|---|
| Sync | 5 s | `GET /agent/v1/state`, then makes sure the interface, address, NAT and DNS resolver exist and diffs the WireGuard peers (adds, removes, updates allowed IPs; unchanged peers keep their sessions) |
| Report | 30 s | `POST /agent/v1/report` with each peer's endpoint, latest handshake and cumulative rx/tx, plus buffered DNS events if activity logging is on |

Because the agent pulls state, admin actions take effect within 5 seconds and nodes never need an inbound control port. If the backend is unreachable, the tunnel keeps working with the last-known peers.

**Apps** (`hidenseek-app`):

```
React + Tailwind UI ──invoke──► Tauri commands (src-tauri) ──► hidenseek-core (Rust)
                                         │                          ├─ OIDC PKCE + loopback redirect
                                         │                          ├─ backend API client, token refresh
                                         │                          ├─ WireGuard key generation
                                         │                          └─ desktop tunnels: wg-quick (Linux),
                                         │                             WireGuard tunnel service (Windows)
                                         └──► plugins/tunnel (Kotlin) ─► WireGuard GoBackend VpnService (Android)
```

Tokens, keys and HTTP stay in Rust. The web view only receives view data, and its CSP allows nothing except the IPC bridge.

## Connection flow

1. The app generates an X25519 key pair and registers the **public** key: `POST /api/v1/devices`.
2. The user picks a location: `POST /api/v1/devices/{id}/tunnel {nodeId}`. The backend allocates the lowest free address in that node's subnet (a unique `(node, address)` constraint guards races) and returns the server key, endpoint, address and DNS.
3. The app renders a wg-quick config with its private key and brings the tunnel up.
4. Within 5 s the agent's sync adds the peer, and WireGuard's handshake retry completes the connection.

## Sessions

A session is derived from the agent's reports, not from the app, so it stays accurate if the app crashes or the device goes offline:

- A peer whose latest handshake is under 3 minutes old is **connected**. The first such report opens a session with the client IP from the WireGuard endpoint and its GeoLite2 location.
- A different client IP (roaming from Wi-Fi to mobile data, for example) closes the session and opens a new one, so every session has a single IP and location.
- A stale handshake closes the session at the time of its last handshake. A sweeper closes sessions on nodes that stopped reporting.
- Byte counters are accumulated as deltas of WireGuard's cumulative counters, which reset when an interface restarts.

## Data model

All tables are prefixed `hs_`.

| Table | Key columns |
|---|---|
| `hs_users` | `subject` (Portal `sub`), `email`, `role`, `status` (PENDING · APPROVED · SUSPENDED) |
| `hs_nodes` | `name`, `country_code`, `endpoint_host`, `listen_port`, `public_key`, `address_cidr`, `dns`, `enabled`, `activity_logging`, token hashes, `last_heartbeat_at` |
| `hs_devices` | `user_id`, `name`, `platform`, `public_key`, `revoked_at` |
| `hs_peers` | `device_id`, `node_id`, `address`, last seen counters |
| `hs_sessions` | `user_email`, `client_ip`, `country_code`, `country`, `region`, `city`, `started_at`, `last_seen_at`, `ended_at`, `rx_bytes`, `tx_bytes` |
| `hs_activity` | `user_id`, `session_id`, `node_id`, `domain`, `query_type`, `occurred_at` |

## API

All endpoints are JSON. Errors look like `{status, code, message, path, timestamp}`.

**Public**

| | |
|---|---|
| `GET /api/v1/public/config` | `{portalUrl, clientId, scopes, tokenBroker}`. Apps configure themselves from it |
| `POST /api/v1/public/auth/token` | `{code, codeVerifier, redirectUri}` → Portal token response (broker mode) |
| `POST /api/v1/public/auth/refresh` | `{refreshToken}` → Portal token response (broker mode) |
| `GET /install.sh` | Node install script |

**Users** (Portal bearer token)

| | |
|---|---|
| `GET /api/v1/me` | Current user, including approval status |
| `GET /api/v1/nodes` | Available locations, with `online` and `activityLogging` |
| `GET` / `POST /api/v1/devices`, `DELETE /api/v1/devices/{id}` | Your devices |
| `POST /api/v1/devices/{id}/tunnel` | `{nodeId}` → tunnel config |
| `GET /api/v1/sessions` | Your session history |

**Admins**

| | |
|---|---|
| `GET /api/v1/admin/stats` | Dashboard counters |
| `GET /api/v1/admin/users`, `PATCH /api/v1/admin/users/{id}` | `{status}` to approve or suspend |
| `GET` / `POST /api/v1/admin/nodes`, `PATCH` / `DELETE /api/v1/admin/nodes/{id}` | Manage servers |
| `POST /api/v1/admin/nodes/{id}/enrollment` | `{token, expiresAt, installCommand}` |
| `GET /api/v1/admin/sessions?active=&userId=&page=&size=` | All sessions |
| `GET /api/v1/admin/activity?userId=&sessionId=&page=&size=` | DNS activity |

**Agents**

| | |
|---|---|
| `POST /agent/v1/enroll` | `{token, publicKey, listenPort, detectedHost, agentVersion}` → `{nodeId, agentToken}` |
| `GET /agent/v1/state` | Desired interface address, port, upstream DNS, logging flag, peers |
| `POST /agent/v1/report` | Peer stats and DNS events |
