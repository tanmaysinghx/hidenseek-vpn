// Fake backend and tunnel for `npm run dev` in a plain browser (/?mock). Never shipped: ipc.ts only
// imports it in development. `?mock=on`, `?mock=connecting` or `?mock=signin` start in that state.
import type { AdminServer, AdminUser, AppView, Device, MyPlan, Page, Plan, PlanRequest, Server, Session, Stats, TunnelStatus, User } from "./types";

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

const GB = 1024 ** 3;
const plans: Plan[] = [
  { id: "free", code: "FREE", name: "Free", description: "For light browsing and messaging.", dailyLimitBytes: 2 * GB, priceLabel: "Free", isDefault: true },
  { id: "plus", code: "PLUS", name: "Plus", description: "Streaming and video calls every day.", dailyLimitBytes: 20 * GB, priceLabel: "₹99 / month", isDefault: false },
  { id: "pro", code: "PRO", name: "Pro", description: "No daily limit.", dailyLimitBytes: null, priceLabel: "₹249 / month", isDefault: false },
];
// `?mock=limited` starts with today's Free allowance used up.
let myPlanId = "free";
let pendingPlan: PlanRequest | null = null;

function myPlan(): MyPlan {
  const plan = plans.find((p) => p.id === myPlanId)!;
  const usedBytes = start === "limited" ? 2 * GB : Math.round(GB * 1.35 + (up ? rx + tx : 0));
  const resetsAt = new Date(new Date().setHours(24, 0, 0, 0)).toISOString();
  const limited = plan.dailyLimitBytes !== null && usedBytes >= plan.dailyLimitBytes;
  return { plan, expiresAt: null, usage: { usedBytes, limitBytes: plan.dailyLimitBytes, resetsAt, limited, exempt: false }, pendingRequest: pendingPlan };
}

const planRequest = (user: User, plan: Plan, note: string | null): PlanRequest => ({
  id: `r-${user.id}-${plan.id}`, userId: user.id, userEmail: user.email, userName: user.displayName, plan, status: "PENDING",
  note, createdAt: new Date(Date.now() - 3_600_000).toISOString(), decidedAt: null, decidedBy: null, decisionNote: null,
});

const adminUser = (u: User, planId: string, usedTodayBytes: number): AdminUser => {
  const plan = plans.find((p) => p.id === planId)!;
  return { ...u, planId, planName: plan.name, dailyLimitBytes: plan.dailyLimitBytes, planExpiresAt: null, usedTodayBytes };
};
const friend: User = { ...me, id: "u2", email: "friend@example.com", displayName: "A friend", role: "USER", status: "APPROVED" };
let requests: PlanRequest[] = [planRequest(friend, plans[1], "Paid via UPI, ref 4821")];

function api(method: string, path: string, body: Record<string, unknown> | null): unknown {
  const p = path.split("?")[0];
  if (p === "/api/v1/me") return me;
  if (p === "/api/v1/plans" || (p === "/api/v1/admin/plans" && method === "GET")) return plans;
  if (p === "/api/v1/me/plan") return myPlan();
  if (p === "/api/v1/me/plan-requests") {
    const plan = plans.find((x) => x.id === body?.planId)!;
    if (plan.isDefault) {
      myPlanId = plan.id;
      pendingPlan = null;
    } else {
      pendingPlan = { ...planRequest(me, plan, (body?.note as string) ?? null), createdAt: new Date().toISOString() };
    }
    return myPlan();
  }
  if (p === "/api/v1/me/plan-requests/pending") {
    pendingPlan = null;
    return null;
  }
  if (p.startsWith("/api/v1/admin/plans/")) {
    const plan = plans.find((x) => x.id === p.split("/").pop())!;
    Object.assign(plan, body);
    return plan;
  }
  if (p === "/api/v1/admin/plan-requests") return path.includes("pending=false") ? requests : requests.filter((r) => r.status === "PENDING");
  if (p.startsWith("/api/v1/admin/plan-requests/")) {
    const [, , , , , id, verb] = p.split("/");
    const r = requests.find((x) => x.id === id)!;
    const decided: PlanRequest = { ...r, status: verb === "approve" ? "APPROVED" : "REJECTED", decidedAt: new Date().toISOString(), decidedBy: me.email, decisionNote: (body?.note as string) ?? null };
    requests = requests.map((x) => (x.id === id ? decided : x));
    return decided;
  }
  if (/^\/api\/v1\/admin\/users\/[^/]+\/plan$/.test(p)) return adminUser(p.includes("u2") ? friend : me, String(body?.planId), 0);
  if (p === "/api/v1/me/location")
    return { ip: up ? "139.59.220.11" : "49.36.112.20", countryCode: "IN", country: "India", region: "Uttar Pradesh", city: "Lucknow", latitude: 26.85, longitude: 80.95 };
  if (p === "/api/v1/nodes") return servers;
  if (p === "/api/v1/sessions") return page(sessions);
  if (p === "/api/v1/devices") return devices;
  if (p === "/api/v1/admin/stats")
    return { users: 12, pendingUsers: 2, nodes: 6, onlineNodes: 5, activeSessions: 4, sessionsLast24h: 31, bytesLast24h: 18_400_000_000 } satisfies Stats;
  if (p === "/api/v1/admin/nodes") return adminServers;
  if (p === "/api/v1/admin/users")
    return [adminUser(me, "pro", 5.2 * GB), adminUser(friend, "free", 2 * GB), adminUser({ ...friend, id: "u3", email: "new@example.com", displayName: null, status: "PENDING" }, "free", 0)];
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
      return api(String(args?.method), String(args?.path), (args?.body as Record<string, unknown> | null) ?? null);
    default:
      return null;
  }
}
