import { invoke } from "@tauri-apps/api/core";
import type { AppError, AppView, RegisterOutcome, TunnelConfig, TunnelStatus } from "./types";

/** Normalizes anything thrown across the IPC boundary into an AppError. */
export function toAppError(e: unknown): AppError {
  if (e && typeof e === "object" && "message" in e) {
    const err = e as Partial<AppError>;
    return { kind: err.kind ?? "other", message: String(err.message) };
  }
  return { kind: "other", message: String(e) };
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const err = toAppError(e);
    if (err.kind === "signedOut") window.dispatchEvent(new CustomEvent("hidenseek:signed-out"));
    throw err;
  }
}

export const ipc = {
  appState: () => call<AppView>("app_state"),
  setServer: (url: string) => call<void>("set_server", { url }),
  signIn: () => call<void>("sign_in"),
  signInPassword: (email: string, password: string) => call<void>("sign_in_password", { email, password }),
  register: (r: { email: string; password: string; firstName: string; lastName: string }) =>
    call<RegisterOutcome>("register", r),
  signOut: () => call<void>("sign_out"),
  connect: (nodeId: string) => call<TunnelConfig>("connect", { nodeId }),
  disconnect: () => call<void>("disconnect"),
  status: () => call<TunnelStatus>("tunnel_status"),
};

type Method = "GET" | "POST" | "PATCH" | "DELETE";

function request<T>(method: Method, path: string, body?: unknown) {
  return call<T>("api", { method, path, body: body ?? null });
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: (path: string) => request<null>("DELETE", path),
};
