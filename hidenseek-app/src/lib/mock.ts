// Fake backend and tunnel for `npm run dev` in a plain browser (/?mock). Never shipped: ipc.ts only
// imports it in development. `?mock=on`, `?mock=connecting` or `?mock=signin` start in that state.
import type { AdminServer, AppView, Device, Page, Server, Session, Stats, TunnelStatus, User } from "./types";

const start = new URLSearchParams(window.location.search).get("mock") ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const servers: Server[] = [
  { id: "sg1", name: "Singapore 1", countryCode: "SG", city: "Singapore", online: true, activityLogging: false },
  { id: "de1", name: "Frankfurt 1", countryCode: "DE", city: "Frankfurt", online: true, activityLogging: false },
  { id: "in1", name: "Mumbai 1", countryCode: "IN", city: "Mumbai", online: true, activityLogging: true },
  { id: "us1", name: "New York 1", countryCode: "US", city: "New York", online: true, activityLogging: false },
  { id: "jp1", name: "Tokyo 1", countryCode: "JP", city: "Tokyo", online: false, activityLogging: false },
  { id: "gb1", name: "London 1", countryCode: "GB", city: "London", online: true, activityLogging: false },
];

const me: User = {
  id: "u1",
  email: "tanmay@example.com",
  displayName: "Tanmay Singh",
  role: "ADMIN",
  status: "APPROVED",
  createdAt: "2026-09-01T10:00:00Z",
  lastSeenAt: new Date().toISOString(),
};

let up = start === "on";
let connectingForever = start === "connecting";
let nodeId = "sg1";
let since = Date.now() / 1000 - 754;
let rx = 48_000_000;
let tx = 3_100_000;
let signedIn = start !== "signin";

function status(): TunnelStatus {
  if (up) {
    rx += 180_000 + Math.random() * 900_000;
    tx += 20_000 + Math.random() * 60_000;
  }
  const s = servers.find((x) => x.id === nodeId)!;
  return {
    up,
    rxBytes: up ? rx : 0,
    txBytes: up ? tx : 0,
    lastHandshake: up ? Date.now() / 1000 - 20 : null,
    since: up ? since : null,
    tunnel: up
      ? { nodeId, nodeName: s.name, countryCode: s.countryCode, address: "10.66.0.7/32", endpoint: `${s.id}.vpn.example.com:51820`, activityLogging: s.activityLogging }
      : null,
  };
}

const sessions: Session[] = servers.slice(0, 4).map((s, i) => ({
  id: `s${i}`,
  userId: "u1",
  userEmail: me.email,
  deviceId: "d1",
  nodeId: s.id,
  clientIp: "49.36.112.20",
  countryCode: s.countryCode,
  country: s.city,
  region: null,
  city: s.city,
  startedAt: new Date(Date.now() - (i + 1) * 9_000_000).toISOString(),
  lastSeenAt: new Date().toISOString(),
  endedAt: i === 0 ? null : new Date().toISOString(),
  elapsedSeconds: 1800 + i * 2400,
  rxBytes: 120_000_000 / (i + 1),
  txBytes: 9_000_000 / (i + 1),
  active: i === 0,
}));

const devices: Device[] = [
  { id: "d1", name: "cachyos-desktop", platform: "LINUX", publicKey: "k8Jw3l1Pq0Zt5u2Vb9Xy7a4Ns6Mq1Rw8Ee0Ff2Gg3H=", createdAt: "2026-10-01T10:00:00Z" },
  { id: "d2", name: "Android device", platform: "ANDROID", publicKey: "Zq1Wx2Ec3Rv4Tb5Yn6Um7Ii8Oo9Pp0AaSsDdFfGgHh=", createdAt: "2026-10-12T10:00:00Z" },
];

const adminServers: AdminServer[] = servers.map((s, i) => ({
  ...s,
  endpointHost: `${s.id}.vpn.example.com`,
  listenPort: 51820,
  publicKey: "pub",
  addressCidr: `10.66.${i}.0/24`,
  dns: "1.1.1.1",
  status: "ENROLLED",
  enabled: true,
  agentVersion: "0.1.12",
  lastHeartbeatAt: new Date().toISOString(),
  createdAt: "2026-09-01T10:00:00Z",
  peerCount: 3 + i,
  activeSessions: i % 3,
}));

const page = <T,>(items: T[]): Page<T> => ({ items, page: 0, size: 50, total: items.length });

function api(method: string, path: string): unknown {
  const p = path.split("?")[0];
  if (p === "/api/v1/me") return me;
  if (p === "/api/v1/me/location")
    return { ip: up ? "139.59.220.11" : "49.36.112.20", countryCode: "IN", country: "India", region: "Uttar Pradesh", city: "Lucknow", latitude: 26.85, longitude: 80.95 };
  if (p === "/api/v1/nodes") return servers;
  if (p === "/api/v1/sessions") return page(sessions);
  if (p === "/api/v1/devices") return devices;
  if (p === "/api/v1/admin/stats")
    return { users: 12, pendingUsers: 2, nodes: 6, onlineNodes: 5, activeSessions: 4, sessionsLast24h: 31, bytesLast24h: 18_400_000_000 } satisfies Stats;
  if (p === "/api/v1/admin/nodes") return adminServers;
  if (p === "/api/v1/admin/users")
    return [me, { ...me, id: "u2", email: "friend@example.com", displayName: "A friend", role: "USER", status: "PENDING" }];
  if (p === "/api/v1/admin/sessions") return page(sessions);
  if (p === "/api/v1/admin/activity") return page([]);
  throw { kind: "api", message: `mock: no handler for ${method} ${p}` };
}

export async function handle(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  await sleep(120);
  switch (cmd) {
    case "app_state":
      return {
        apiUrl: "https://vpn.example.com",
        portalUrl: "https://sso.example.com",
        signedIn,
        passwordLogin: true,
        browserLogin: true,
        deviceId: "d1",
        lastNodeId: nodeId,
        platform: "LINUX",
      } satisfies AppView;
    case "tunnel_status":
      return status();
    case "connect":
      nodeId = String(args?.nodeId);
      if (connectingForever) return new Promise(() => {});
      await sleep(3200);
      up = true;
      since = Date.now() / 1000;
      return status().tunnel;
    case "disconnect":
      await sleep(900);
      up = false;
      return null;
    case "sign_in_password":
    case "sign_in":
      await sleep(800);
      signedIn = true;
      return null;
    case "sign_out":
      signedIn = false;
      return null;
    case "api":
      return api(String(args?.method), String(args?.path));
    default:
      return null;
  }
}
