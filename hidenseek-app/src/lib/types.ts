export type Platform = "WINDOWS" | "LINUX" | "ANDROID" | "MACOS" | "OTHER";

export interface AppView {
  apiUrl: string | null;
  portalUrl: string | null;
  signedIn: boolean;
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
