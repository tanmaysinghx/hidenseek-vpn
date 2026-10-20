# Self-hosting Hidenseek VPN

You need:

- A Linux VPS for the backend (1 GB RAM is plenty). It can also be your first VPN server.
- A domain name for the backend, e.g. `vpn.example.com`.
- A MySQL 8 database: managed (Aiven, PlanetScale-compatible, RDS) or your own.
- A [Portal SSO](https://github.com/tanmaysinghx/portal-sso) deployment for sign-in.
- For each VPN location: a Linux VPS with kernel 5.6+ (any current Ubuntu, Debian, Rocky or Alma) and UDP 51820 open.

## 1. Register the apps in Portal SSO

In the Portal admin console, go to **Applications → New application**:

| Field | Value |
|---|---|
| Name | Hidenseek VPN |
| Launch URL | `https://vpn.example.com` |
| Single sign-on | **New client** |
| Client ID | `hidenseek-vpn` |
| Redirect URIs | `http://127.0.0.1:47863/callback` |
| Scopes | `openid profile email` |
| Confidential client | **Ticked** |

Copy the **client secret** from the Keys & setup dialog. Portal shows it only once.

**Why a confidential client for a desktop/mobile app?** Portal (Spring Authorization Server) issues refresh tokens only to confidential clients. The apps never see the secret: they run the normal PKCE sign-in in the browser, then hand the authorization code to the backend's token broker (`/api/v1/public/auth/token`), which redeems it with the secret. Portal still verifies PKCE, so a stolen code is useless. If you leave `PORTAL_CLIENT_SECRET` empty, the apps use a public client instead, and sign-in only lasts one 15-minute access token. The tunnel keeps running after that, but the app asks you to sign in again.

The redirect URI uses the loopback address `127.0.0.1`, as RFC 8252 recommends for native apps. If port 47863 is busy the app uses a random port, and Portal accepts any port for loopback IPs.

## 2. Run the backend

Point the domain's DNS `A` record at the VPS, open TCP 80 and 443, then:

```bash
git clone https://github.com/tanmaysinghx/hidenseek-vpn.git
cd hidenseek-vpn/deploy
cp .env.example .env
$EDITOR .env          # DOMAIN, DB_*, PORTAL_*, ADMIN_EMAILS
docker compose up -d
docker compose logs -f backend
```

Caddy obtains a TLS certificate automatically. Flyway creates the `hs_*` tables on first start. They are prefixed, so sharing a database with Portal is fine.

### Locations for sessions (optional)

Session rows always include the client IP. To also record country, region and city, create a free [MaxMind GeoLite2](https://www.maxmind.com/en/geolite2/signup) account, put `GEOIPUPDATE_ACCOUNT_ID` and `GEOIPUPDATE_LICENSE_KEY` in `.env`, and run:

```bash
docker compose --profile geoip up -d
```

Lookups use the local database, so client IPs are never sent to a third party.

### Without Docker

```bash
cd hidenseek-backend
cp .env.example .env && $EDITOR .env
./gradlew bootJar
java -jar build/libs/hidenseek-backend-*.jar   # reads ./.env
```

Put any reverse proxy with HTTPS in front of port 8090.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PUBLIC_URL` | | Public HTTPS URL; used in install commands |
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | | MySQL connection |
| `PORTAL_URL` | | Portal issuer URL, no trailing slash. Must equal the `iss` in tokens |
| `PORTAL_CLIENT_ID` | | The OAuth client from step 1. Tokens must have it in `aud` |
| `PORTAL_CLIENT_SECRET` | empty | Enables the token broker (long-lived sign-in) |
| `PORTAL_APP_ID`, `PORTAL_API_KEY` | empty | Portal external app credentials. With both set, the apps offer email/password sign-in and sign-up; the backend checks the password with Portal and issues its own 30-day rotating session |
| `APP_TOKEN_SECRET` | derived | HMAC key for those app sessions. Derived from the Portal secrets when empty; set it to rotate on its own (signs every app session out) |
| `ADMIN_EMAILS` | empty | Comma-separated admins, in addition to Portal `ROLE_ADMIN` users |
| `AUTO_APPROVE_USERS` | `false` | Let anyone with a Portal account connect without approval |
| `MAX_DEVICES_PER_USER` | `5` | |
| `GEOIP_DATABASE` | empty | Path to `GeoLite2-City.mmdb` |
| `ACTIVITY_RETENTION` | `30d` | How long DNS activity is kept |

## 3. Add VPN servers

1. Open the app, sign in as an admin, and go to **Admin → Servers → Add server**.
2. Enter a name and a two-letter country code. The public host is optional: the agent detects the VPS's public IP. The tunnel subnet defaults to `10.66.0.0/24` (253 devices). Give each server its own subnet if you want to tell them apart.
3. Copy the install command and run it on the VPS. It:
   - checks for WireGuard kernel support and installs `iptables` if it's missing,
   - downloads `hidenseek-agent` from GitHub Releases and verifies its checksum,
   - enrolls with the single-use token (valid for one hour),
   - opens UDP 51820 in `ufw`/`firewalld` and starts the `hidenseek-agent` systemd service.
4. Also allow **UDP 51820** in your cloud provider's firewall or security group.

The server shows as **Online** within seconds. Check the agent with `journalctl -u hidenseek-agent -f`.

The agent sets up NAT, blocks client-to-client traffic, clamps TCP MSS, and runs a DNS resolver on the tunnel gateway (e.g. `10.66.0.1`) that forwards to the server's upstream resolvers (`1.1.1.1, 9.9.9.9` by default).

To remove a server, delete it in the console, then run `systemctl disable --now hidenseek-agent && ip link del hs0` on the VPS.

## 4. Give friends access

- Build the apps (see the README), or publish a tag to get installers from GitHub Actions. Set the repository variable `HIDENSEEK_DEFAULT_SERVER` to pre-fill your server address.
- Friends sign in or register through Portal and then wait for approval. Approve them under **Admin → Users**.

### Client requirements

None: install the app and sign in.

| Platform | How the tunnel works |
|---|---|
| Windows 10/11 | The installer bundles WireGuard's signed engine and the app installs it silently on first connect. The app runs as administrator to manage the tunnel service. |
| Linux | The app drives the kernel's built-in WireGuard (Linux 5.6+) itself; no `wireguard-tools`. The .deb, .rpm and Arch packages add a polkit rule so the person at the computer connects without a password. The AppImage asks for it on connect. |
| Android | Built in. Android asks once for VPN permission. |

## Troubleshooting

| Symptom | Fix |
|---|---|
| Sign-in shows a Portal `redirect_uri` error | Register exactly `http://127.0.0.1:47863/callback` on the client |
| Every API call returns 401 | `PORTAL_URL` must equal the token's `iss` exactly, and `PORTAL_CLIENT_ID` must match `aud` |
| Connected, but no internet | UDP 51820 is blocked by the cloud firewall, or the server was just added (wait ~5 s for the agent to pick up the peer) |
| Server stays "Awaiting install" | The enrollment token expired (1 h). Click **Install command** for a new one |
| Sessions have no location | Configure GeoLite2 (see above) |
