// Fake backend for working on the console without Portal or a database:
//   npm run mock        (API on :8090, then `npm start` and open http://localhost:4300/console/)
// Every signed-in check passes as an admin. Data is generated, deterministic per day.
import { createServer } from 'node:http';

const DAY = 86_400_000;
const now = Date.now();
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (list) => list[Math.floor(rand() * list.length)];
const iso = (t) => new Date(t).toISOString();

const users = [
  ['Tanmay Singh', 'tanmaysinghx@gmail.com', 'ADMIN', 'APPROVED'],
  ['Aarav Mehta', 'aarav.mehta@gmail.com', 'USER', 'APPROVED'],
  ['Priya Nair', 'priya.nair@outlook.com', 'USER', 'APPROVED'],
  ['Rohan Gupta', 'rohan.g@proton.me', 'USER', 'APPROVED'],
  ['Sara Khan', 'sara.khan@gmail.com', 'USER', 'APPROVED'],
  ['Vikram Rao', 'vikram.rao@yahoo.com', 'USER', 'SUSPENDED'],
  ['Neha Joshi', 'neha.joshi@gmail.com', 'USER', 'PENDING'],
  [null, 'dev.kapoor@icloud.com', 'USER', 'PENDING'],
].map(([displayName, email, role, status], i) => ({
  id: `u${i + 1}`, email, displayName, role, status,
  createdAt: iso(now - (60 - i * 6) * DAY), lastSeenAt: iso(now - i * 3_600_000),
}));
const places = [
  ['IN', 'India', 'Maharashtra', 'Mumbai', '49.36.'], ['IN', 'India', 'Karnataka', 'Bengaluru', '106.51.'],
  ['IN', 'India', 'Delhi', 'New Delhi', '122.161.'], ['SG', 'Singapore', null, 'Singapore', '175.156.'],
  ['AE', 'United Arab Emirates', 'Dubai', 'Dubai', '94.200.'], ['GB', 'United Kingdom', 'England', 'London', '81.2.'],
];
const domains = ['youtube.com', 'www.google.com', 'instagram.com', 'web.whatsapp.com', 'github.com', 'netflix.com',
  'open.spotify.com', 'reddit.com', 'x.com', 'chat.openai.com', 'linkedin.com', 'amazon.in', 'stackoverflow.com',
  'hotstar.com', 'discord.com', 'news.ycombinator.com', 'claude.ai', 'wikipedia.org'];
const servers = [
  { id: 'n1', name: 'Singapore 1', countryCode: 'SG', city: 'Singapore', endpointHost: '51.79.164.222', listenPort: 51820,
    publicKey: 'x', addressCidr: '10.66.0.0/24', dns: '1.1.1.1,9.9.9.9', status: 'ENROLLED', enabled: true,
    activityLogging: true, online: true, agentVersion: 'v0.1.0', lastHeartbeatAt: iso(now - 12_000), createdAt: iso(now - 9 * DAY),
    peerCount: 9, activeSessions: 3 },
  { id: 'n2', name: 'Frankfurt 1', countryCode: 'DE', city: 'Frankfurt', endpointHost: null, listenPort: 51820, publicKey: null,
    addressCidr: '10.67.0.0/24', dns: '1.1.1.1', status: 'PENDING', enabled: true, activityLogging: false, online: false,
    agentVersion: null, lastHeartbeatAt: null, createdAt: iso(now - DAY), peerCount: 0, activeSessions: 0 },
];

const sessions = [];
for (let d = 89; d >= 0; d--) {
  const count = Math.round(4 + rand() * 9 + (d < 20 ? 4 : 0));
  for (let i = 0; i < count; i++) {
    const u = pick(users.slice(0, 6));
    const p = pick(places);
    const start = now - d * DAY - rand() * DAY * 0.9;
    const secs = Math.round(600 + rand() * 9000);
    const live = d === 0 && i < 3;
    sessions.push({
      id: `s${sessions.length}`, userId: u.id, userEmail: u.email, deviceId: `d-${u.id}`, nodeId: 'n1',
      clientIp: `${p[4]}${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}`, countryCode: p[0], country: p[1], region: p[2], city: p[3],
      startedAt: iso(start), lastSeenAt: iso(live ? now : start + secs * 1000), endedAt: live ? null : iso(start + secs * 1000),
      elapsedSeconds: live ? Math.round((now - start) / 1000) : secs,
      rxBytes: Math.round(secs * (2_000 + rand() * 20_000)), txBytes: Math.round(secs * (30_000 + rand() * 300_000)), active: live,
    });
  }
}
sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
const activity = [];
for (let i = 0; i < 4000; i++) {
  const s = pick(sessions.slice(0, 600));
  const weight = Math.floor(rand() ** 2.2 * domains.length);
  activity.push({ id: i, sessionId: s.id, userId: s.userId, userEmail: s.userEmail, nodeId: 'n1', domain: domains[weight],
    queryType: rand() < 0.8 ? 'A' : 'AAAA', occurredAt: iso(new Date(s.startedAt).getTime() + rand() * s.elapsedSeconds * 1000) });
}
activity.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

const since = (days) => now - (days - 1) * DAY - (now % DAY);
const inWindow = (days, list = sessions) => list.filter((s) => new Date(s.endedAt ?? s.lastSeenAt).getTime() > since(days));
function daily(days, list) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * DAY).toISOString().slice(0, 10);
    const day = list.filter((s) => s.startedAt.slice(0, 10) === date);
    out.push({ date, sessions: day.length, activeUsers: new Set(day.map((s) => s.userId)).size,
      downloadBytes: day.reduce((n, s) => n + s.txBytes, 0), uploadBytes: day.reduce((n, s) => n + s.rxBytes, 0) });
  }
  return out;
}
function topDomains(days, userId, limit = 10) {
  const counts = new Map();
  for (const a of activity) {
    if (new Date(a.occurredAt).getTime() < since(days) || (userId && a.userId !== userId)) continue;
    const c = counts.get(a.domain) ?? { domain: a.domain, lookups: 0, people: new Set(), lastSeen: a.occurredAt };
    c.lookups++;
    c.people.add(a.userId);
    counts.set(a.domain, c);
  }
  return [...counts.values()].sort((a, b) => b.lookups - a.lookups).slice(0, limit)
    .map(({ people, ...c }) => ({ ...c, users: people.size }));
}
const page = (items, q) => {
  const p = Number(q.get('page') ?? 0), size = Number(q.get('size') ?? 50);
  return { items: items.slice(p * size, p * size + size), page: p, size, total: items.length };
};
const stats = { users: users.length, pendingUsers: 2, nodes: 2, onlineNodes: 1, activeSessions: 3,
  sessionsLast24h: sessions.filter((s) => new Date(s.startedAt).getTime() > now - DAY).length, bytesLast24h: 9_800_000_000 };

function route(path, q) {
  const days = Number(q.get('days') ?? 7);
  if (path === '/api/v1/public/auth/web/refresh' || path === '/api/v1/public/auth/web/token') return { accessToken: 'mock', expiresIn: 900 };
  if (path === '/api/v1/public/config') return { name: 'Hidenseek VPN', portalUrl: 'https://portal.example', clientId: 'hidenseek-vpn', scopes: 'openid profile email', tokenBroker: true };
  if (path === '/api/v1/me') return users[0];
  if (path === '/api/v1/admin/insights/dashboard') {
    const w = inWindow(days);
    const byUser = Object.values(Object.groupBy(w, (s) => s.userId)).map((list) => {
      const u = users.find((x) => x.id === list[0].userId);
      return { userId: u.id, email: u.email, displayName: u.displayName, sessions: list.length,
        downloadBytes: list.reduce((n, s) => n + s.txBytes, 0), uploadBytes: list.reduce((n, s) => n + s.rxBytes, 0),
        connectedSeconds: list.reduce((n, s) => n + s.elapsedSeconds, 0), lastConnected: list[0].lastSeenAt };
    }).sort((a, b) => b.downloadBytes + b.uploadBytes - a.downloadBytes - a.uploadBytes);
    const countries = Object.values(Object.groupBy(w, (s) => s.countryCode)).map((list) => ({ countryCode: list[0].countryCode,
      country: list[0].country, sessions: list.length, users: new Set(list.map((s) => s.userId)).size })).sort((a, b) => b.sessions - a.sessions);
    return { days, stats, activityLookups: activity.filter((a) => new Date(a.occurredAt).getTime() > since(days)).length,
      daily: daily(days, w), topDomains: topDomains(days), topUsers: byUser, countries,
      live: sessions.filter((s) => s.active).map((s) => ({ session: s, nodeName: 'Singapore 1', deviceName: pick(['Pixel 8', 'ThinkPad', 'Desktop']) })),
      recentActivity: activity.slice(0, 15) };
  }
  const userMatch = path.match(/^\/api\/v1\/admin\/insights\/users\/(\w+)$/);
  if (userMatch) {
    const u = users.find((x) => x.id === userMatch[1]);
    const w = inWindow(days, sessions.filter((s) => s.userId === u.id));
    return { days, user: u, sessions: w.length, downloadBytes: w.reduce((n, s) => n + s.txBytes, 0), uploadBytes: w.reduce((n, s) => n + s.rxBytes, 0),
      connectedSeconds: w.reduce((n, s) => n + s.elapsedSeconds, 0), activityLookups: activity.filter((a) => a.userId === u.id).length,
      daily: daily(days, w), topDomains: topDomains(days, u.id, 15),
      devices: [{ id: 'd1', name: 'Pixel 8', platform: 'ANDROID', publicKey: 'k', createdAt: iso(now - 20 * DAY) },
        { id: 'd2', name: 'ThinkPad', platform: 'LINUX', publicKey: 'k', createdAt: iso(now - 30 * DAY) }],
      recentSessions: sessions.filter((s) => s.userId === u.id).slice(0, 20) };
  }
  if (path === '/api/v1/admin/insights/websites') return topDomains(days, q.get('userId'), Number(q.get('limit') ?? 50));
  if (path === '/api/v1/admin/activity') {
    const term = (q.get('q') ?? '').toLowerCase();
    return page(activity.filter((a) => (!q.get('userId') || a.userId === q.get('userId')) && (!term || a.domain.includes(term))), q);
  }
  if (path === '/api/v1/admin/users') return users;
  if (path === '/api/v1/admin/sessions') return page(sessions.filter((s) => q.get('active') !== 'true' || s.active), q);
  if (path === '/api/v1/sessions') return page(sessions.filter((s) => s.userId === 'u1'), q);
  if (path === '/api/v1/admin/nodes') return servers;
  return null;
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const body = route(url.pathname, url.searchParams);
  res.writeHead(body === null ? 404 : 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body ?? { message: 'not mocked' }));
}).listen(8090, () => console.log('Mock API on http://localhost:8090'));
