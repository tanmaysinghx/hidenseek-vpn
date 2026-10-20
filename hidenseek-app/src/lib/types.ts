export type Platform = "WINDOWS" | "LINUX" | "ANDROID" | "MACOS" | "OTHER";

export interface AppView {
  apiUrl: string | null;
  portalUrl: string | null;
  signedIn: boolean;
  passwordLogin: boolean;
  browserLogin: boolean;
  deviceId: string | null;
  lastNodeId: string | null;
  platform: Platform;
}

export type UserStatus = "PENDING" | "APPROVED" | "SUSPENDED";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN";
  status: UserStatus;
  createdAt: string;
  lastSeenAt: string | null;
}

export interface Server {
  id: string;
  name: string;
  countryCode: string;
  city: string | null;
  online: boolean;
  activityLogging: boolean;
}

export interface AdminServer extends Server {
  endpointHost: string | null;
  listenPort: number;
  publicKey: string | null;
  addressCidr: string;
  dns: string;
  status: "PENDING" | "ENROLLED";
  enabled: boolean;
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

export interface TunnelConfig {
  nodeId: string;
  nodeName: string;
  countryCode: string;
  address: string;
  endpoint: string;
  activityLogging: boolean;
}

export interface TunnelStatus {
  up: boolean;
  rxBytes: number;
  txBytes: number;
  lastHandshake: number | null;
  tunnel: TunnelConfig | null;
  since: number | null;
}

export interface Device {
  id: string;
  name: string;
  platform: Platform;
  publicKey: string;
  createdAt: string;
}

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
  /** Server side: rx is what the client uploaded, tx what it downloaded. */
  rxBytes: number;
  txBytes: number;
  active: boolean;
}

export interface ActivityEvent {
  id: number;
  sessionId: string | null;
  userId: string;
  nodeId: string;
  domain: string;
  queryType: string;
  occurredAt: string;
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

export interface AppError {
  kind: "signedOut" | "api" | "network" | "tunnel" | "other";
  message: string;
}

export type RegisterOutcome = { outcome: "signedIn" } | { outcome: "pending"; message: string };

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
  /** Today's allowance is used up: the VPN is paused until resetsAt. */
  limited: boolean;
  /** Admins are never limited. */
  exempt: boolean;
}

export type PlanRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

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
