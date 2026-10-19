<p align="center">
  <img src="hidenseek-app/public/logo.svg" width="72" alt="Hidenseek VPN logo" />
</p>

<h1 align="center">Hidenseek VPN</h1>

<p align="center">
  A self-hosted WireGuard VPN for you and your friends. Bring your own VPS (or ten), sign in with
  <a href="https://github.com/tanmaysinghx/portal-sso">Portal SSO</a>, and connect from Windows 11, Linux or Android.
</p>

---

## Features

- **WireGuard**, full tunnel (IPv4 + IPv6 leak protection), with DNS forced through the server.
- **One-line server install.** Add a server in the admin console, paste the command on any Linux VPS, and it shows up online.
- **Many locations.** Every VPS you add is a selectable location. Each device gets its own address on each server.
- **Portal SSO sign-in.** Login and registration are handled by Portal. New users wait for admin approval (configurable).
- **Session history.** For every connection it stores the user's email, client IP, country, region, city, elapsed time, and bytes up and down.
- **Optional activity log.** Per server, off by default: records the domains each user looks up. Users are told before they connect. See [Privacy](#privacy).
- **Apps** for Windows 11, Linux and Android from one Tauri + React + Tailwind codebase. The private key is generated on the device and never leaves it.

## How it fits together

```
                ┌──────────────────────┐   OIDC + PKCE    ┌──────────────┐
  Windows ──┐   │  hidenseek-backend   │ ◄──────────────► │  Portal SSO  │
  Linux   ──┼──►│  Spring Boot · MySQL │  validates JWTs  └──────────────┘
  Android ──┘   │  users, servers,     │
     │          │  devices, sessions   │◄─────────┐  agents poll desired peers,
     │          └──────────────────────┘          │  report handshakes, bytes, DNS
     │                                            │
     │      WireGuard (UDP 51820)      ┌──────────┴─────────┐
     └────────────────────────────────►│  hidenseek-agent   │  one per VPS
                                       │  wg + NAT + DNS    │  (Singapore, ...)
                                       └────────────────────┘
```

| Directory | What it is | Stack |
|---|---|---|
| [`hidenseek-backend/`](hidenseek-backend) | Control plane API: users, servers, devices, sessions, activity | Java 25, Spring Boot 4, MySQL, Flyway |
| [`hidenseek-agent/`](hidenseek-agent) | Runs on each VPS: WireGuard interface, NAT, DNS resolver, stats | Go, wgctrl, miekg/dns |
| [`hidenseek-app/`](hidenseek-app) | Client apps for Windows, Linux and Android | Tauri 2, React 19, Tailwind 4, Rust |
| [`deploy/`](deploy) | Docker Compose with automatic HTTPS (Caddy) | |
| [`docs/`](docs) | [Self-hosting guide](docs/self-hosting.md) · [Architecture & API](docs/architecture.md) | |

The agent only makes outbound HTTPS calls to the backend, so VPN servers need no open admin port, just UDP 51820.

## Quick start

The [self-hosting guide](docs/self-hosting.md) has the details. In short:

1. **Register the app in Portal SSO.** Create a *confidential* OAuth client `hidenseek-vpn` with the redirect URI `http://127.0.0.1:47863/callback` and scopes `openid profile email`.
2. **Run the backend.**
   ```bash
   cd deploy && cp .env.example .env && $EDITOR .env
   docker compose up -d
   ```
3. **Sign in** with the app as an admin (an email listed in `ADMIN_EMAILS`, or a Portal `ROLE_ADMIN` user).
4. **Add a server.** Go to Admin → Servers → Add server, then run the command it shows on your VPS:
   ```bash
   curl -fsSL https://vpn.example.com/install.sh | sudo bash -s -- --api https://vpn.example.com --token hsn_enroll_…
   ```
5. **Invite friends.** Send them the app and your server address, and approve them under Admin → Users.

## Privacy

What the operator of a Hidenseek server can see:

| Always recorded | Only if the server's **Log activity** is on |
|---|---|
| Account email, device, client public IP and its approximate location, connect/disconnect times, bytes transferred | Domain names looked up through the VPN (e.g. `youtube.com`), with the time and user |

- Page contents and full URLs are **not** visible: HTTPS encrypts them end to end. DNS lookups are what a VPN operator can realistically see.
- Activity logging is off by default for each server. When it is on, the app marks the server with an eye icon, and a user must accept a notice before their first connection to it.
- Activity records are deleted automatically after `ACTIVITY_RETENTION` (30 days by default).
- If you run this for other people, tell them what you log. Depending on where you and they live, logging browsing activity may need their consent under privacy law (for example the GDPR or India's DPDP Act).

## Development

```bash
# Backend: needs Java 25. Tests use an in-memory H2 and never touch your database.
cd hidenseek-backend && cp .env.example .env && ./gradlew test bootRun

# Agent: needs Go. Running it needs root on Linux.
cd hidenseek-agent && make test build

# Apps: needs Node 24 and Rust. On Linux also install webkit2gtk-4.1 and wireguard-tools.
cd hidenseek-app && npm install && npm run tauri dev
cd hidenseek-app/core && cargo test        # platform-independent client logic
```

To build the Android app: install the Android SDK and NDK, then run `npx tauri android init` once, followed by `npx tauri android build --apk`.

## Roadmap

- macOS and iOS apps (Network Extension)
- Per-user server access lists
- IPv6 inside the tunnel
- Agent auto-update

## License

[MIT](LICENSE)
