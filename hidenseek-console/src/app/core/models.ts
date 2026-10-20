// Mirrors the backend DTOs (hidenseek-backend: *Dtos.java). Dates are ISO strings.

export type UserStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED';

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: 'USER' | 'ADMIN';
  status: UserStatus;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface PublicConfig {
  name: string;
  portalUrl: string;
  clientId: string;
  scopes: string;
  tokenBroker: boolean;
}

export interface Page<T> {
  items: T[];
  page: number;
  size: number;
  total: number;
}

export interface Stats {
  users: number;
  pendingUsers: number;
  nodes: number;
  onlineNodes: number;
  activeSessions: number;
  sessionsLast24h: number;
  bytesLast24h: number;
}

/** rxBytes/txBytes are server counters: tx = the user's download, rx = upload. */
export interface Session {
  id: string;
  userId: string;
  userEmail: string;
  deviceId: string;
  nodeId: string;
  clientIp: string;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  elapsedSeconds: number;
  rxBytes: number;
  txBytes: number;
  active: boolean;
}

export interface ActivityEvent {
  id: number;
  sessionId: string | null;
  userId: string;
  userEmail: string | null;
  nodeId: string;
  domain: string;
  queryType: string;
  occurredAt: string;
}

export interface DayPoint {
  date: string;
  sessions: number;
  activeUsers: number;
  downloadBytes: number;
  uploadBytes: number;
}

export interface DomainStat {
  domain: string;
  lookups: number;
  users: number;
  lastSeen: string;
}

export interface UserTraffic {
  userId: string;
  email: string;
  displayName: string | null;
  sessions: number;
  downloadBytes: number;
  uploadBytes: number;
  connectedSeconds: number;
  lastConnected: string | null;
}

export interface CountryStat {
  countryCode: string | null;
  country: string | null;
  sessions: number;
  users: number;
}

export interface LiveSession {
  session: Session;
  nodeName: string | null;
  deviceName: string | null;
}

export interface Dashboard {
  days: number;
  stats: Stats;
  activityLookups: number;
  daily: DayPoint[];
  topDomains: DomainStat[];
  topUsers: UserTraffic[];
  countries: CountryStat[];
  live: LiveSession[];
  recentActivity: ActivityEvent[];
}

export interface Device {
  id: string;
  name: string;
  platform: 'WINDOWS' | 'LINUX' | 'ANDROID' | 'MACOS' | 'IOS' | 'OTHER';
  publicKey: string;
  createdAt: string;
}

export interface UserInsights {
  days: number;
  user: User;
  sessions: number;
  downloadBytes: number;
  uploadBytes: number;
  connectedSeconds: number;
  activityLookups: number;
  daily: DayPoint[];
  topDomains: DomainStat[];
  devices: Device[];
  recentSessions: Session[];
}

export interface Server {
  id: string;
  name: string;
  countryCode: string;
  city: string | null;
  endpointHost: string | null;
  listenPort: number;
  publicKey: string | null;
  addressCidr: string;
  dns: string;
  status: 'PENDING' | 'ENROLLED';
  enabled: boolean;
  activityLogging: boolean;
  online: boolean;
  agentVersion: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  peerCount: number;
  activeSessions: number;
}

export interface Enrollment {
  token: string;
  expiresAt: string;
  installCommand: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  /** null = unlimited */
  dailyLimitBytes: number | null;
  priceLabel: string | null;
  isDefault: boolean;
}

export interface Usage {
  usedBytes: number;
  limitBytes: number | null;
  resetsAt: string;
  /** Today's allowance is used up: the user is off every server until resetsAt. */
  limited: boolean;
  /** Admins are never limited. */
  exempt: boolean;
}

export type PlanRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface PlanRequest {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  plan: Plan;
  status: PlanRequestStatus;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

export interface MyPlan {
  plan: Plan;
  expiresAt: string | null;
  usage: Usage;
  pendingRequest: PlanRequest | null;
}

/** Admin user list rows: the user plus their plan and today's usage. */
export interface AdminUser extends User {
  planId: string;
  planName: string;
  dailyLimitBytes: number | null;
  planExpiresAt: string | null;
  usedTodayBytes: number;
}

// ---- Audit log, traffic analytics, control panel ----------------------------------------------

export type AuditClient = 'APP' | 'WEB' | 'OTHER';

export interface AuditLog {
  id: number;
  occurredAt: string;
  userEmail: string | null;
  method: string;
  path: string;
  route: string;
  status: number;
  durationMs: number;
  client: AuditClient;
  ip: string | null;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  referrer: string | null;
  userAgent: string | null;
}

export interface AuditFilter {
  days: number;
  user?: string | null;
  method?: string | null;
  status?: string | null;
  q?: string | null;
  page?: number;
  size?: number;
}

/** {@code uniques}: distinct IPs (audit) or visitors (traffic). */
export interface PlaceStat {
  code: string;
  name: string | null;
  countryCode: string | null;
  requests: number;
  uniques: number;
}

export interface AuditStats {
  days: number;
  requests: number;
  failures: number;
  uniqueIps: number;
  uniqueUsers: number;
  avgMs: number;
  daily: { date: string; requests: number; failures: number }[];
  statusClasses: Record<string, number>;
  clients: Record<AuditClient, number>;
  topRoutes: { method: string; route: string; requests: number; failures: number; avgMs: number }[];
  topUsers: { email: string; requests: number; failures: number; lastSeen: string }[];
  topIps: { ip: string; countryCode: string | null; region: string | null; requests: number; failures: number; lastSeen: string }[];
  countries: PlaceStat[];
  regions: PlaceStat[];
}

export interface TrafficDay {
  date: string;
  pageViews: number;
  visitors: number;
  visits: number;
}

export interface TrafficStats {
  days: number;
  pageViews: number;
  visitors: number;
  visits: number;
  signedInUsers: number;
  daily: TrafficDay[];
  sources: { source: string; visits: number; visitors: number }[];
  campaigns: { source: string | null; medium: string | null; campaign: string | null; visits: number }[];
  landingPages: { path: string; views: number; visitors: number }[];
  topPages: { path: string; views: number; visitors: number }[];
  countries: PlaceStat[];
  regions: PlaceStat[];
  devices: Record<'DESKTOP' | 'MOBILE' | 'TABLET' | 'OTHER', number>;
}

export type DataSetId = 'audit' | 'traffic' | 'activity';

export interface DataSet {
  id: DataSetId;
  label: string;
  rows: number;
  oldest: string | null;
  retentionDays: number;
}

export interface SystemInfo {
  geoipEnabled: boolean;
  timezone: string;
  auditLogReads: boolean;
  data: DataSet[];
  users: number;
  nodes: number;
  devices: number;
}

export interface Deleted {
  deleted: number;
  before: string;
}
