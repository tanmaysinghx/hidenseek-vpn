import { History, House, MonitorSmartphone, Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

export type Route = "home" | "history" | "devices" | "admin" | "settings";

const items: { id: Route; label: string; icon: typeof House; admin?: boolean }[] = [
  { id: "home", label: "Connect", icon: House },
  { id: "history", label: "History", icon: History },
  { id: "devices", label: "Devices", icon: MonitorSmartphone },
  { id: "admin", label: "Admin", icon: ShieldCheck, admin: true },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Shell({
  route,
  onNavigate,
  isAdmin,
  connected,
  children,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  isAdmin: boolean;
  connected: boolean;
  children: ReactNode;
}) {
  const visible = items.filter((i) => !i.admin || isAdmin);
  return (
    <div className="flex h-full">
      {/* Sidebar: tablets and desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/5 bg-ink-950/60 p-4 md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2 pt-1">
          <img src="/logo.svg" alt="" className="size-8" />
          <div>
            <div className="text-[15px] font-bold leading-tight">Hidenseek</div>
            <div className="text-[11px] font-medium text-ink-400">Private VPN</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {visible.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={cx(
                "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                route === id ? "bg-white/[0.06] text-ink-100" : "text-ink-400 hover:bg-white/[0.03] hover:text-ink-100",
              )}
            >
              <Icon className={cx("size-[18px]", route === id && "text-brand-400")} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs">
          <span className={cx("size-2 rounded-full", connected ? "bg-brand-400 shadow-[0_0_10px] shadow-brand-400" : "bg-ink-600")} />
          <span className={connected ? "text-brand-300" : "text-ink-400"}>{connected ? "Protected" : "Not protected"}</span>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>

      {/* Bottom tabs: phones */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/5 bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {visible.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cx("flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium", route === id ? "text-brand-400" : "text-ink-400")}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
