import { Gauge, Globe2, History, MonitorSmartphone, Settings, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./ui";

export type Route = "home" | "history" | "devices" | "plan" | "admin" | "settings";

const items: { id: Route; label: string; icon: typeof Globe2; admin?: boolean }[] = [
  { id: "home", label: "Connect", icon: Globe2 },
  { id: "history", label: "History", icon: History },
  { id: "devices", label: "Devices", icon: MonitorSmartphone },
  { id: "plan", label: "Plan", icon: Gauge },
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
  // The Connect screen is edge to edge (map); other screens sit in a centered column.
  const fullBleed = route === "home";
  return (
    <div className="flex h-full bg-ink-900">
      {/* Icon rail: tablets and desktop */}
      <aside className="hidden w-[76px] shrink-0 flex-col items-center border-r border-white/[0.06] bg-ink-950 py-4 md:flex">
        <img src="/logo.svg" alt="Hidenseek" className="mb-6 size-9" />
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {visible.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              aria-current={route === id ? "page" : undefined}
              className={cx(
                "group relative flex w-[60px] flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition-colors",
                route === id ? "bg-brand-500/15 text-brand-300" : "text-ink-400 hover:bg-white/[0.05] hover:text-ink-100",
              )}
            >
              {route === id && <span className="absolute -left-2 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />}
              <Icon className="size-5" strokeWidth={route === id ? 2.3 : 2} />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex flex-col items-center gap-1.5" title={connected ? "Protected" : "Unprotected"}>
          <span className="relative grid size-8 place-items-center">
            {connected && <span className="absolute inset-1 rounded-full bg-ok-400/40 animate-ping-slow" />}
            <span className={cx("relative size-3 rounded-full ring-4", connected ? "bg-ok-400 ring-ok-500/20" : "bg-rose-400 ring-rose-500/15")} />
          </span>
          <span className={cx("text-[10px] font-semibold", connected ? "text-ok-300" : "text-rose-300")}>{connected ? "On" : "Off"}</span>
        </div>
      </aside>

      <main className={cx("min-w-0 flex-1 overflow-y-auto pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0", fullBleed && "md:overflow-hidden")}>
        {fullBleed ? (
          <div className="h-full">{children}</div>
        ) : (
          <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-10">{children}</div>
        )}
      </main>

      {/* Bottom tabs: phones */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-white/[0.06] bg-ink-950/[0.97] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        {visible.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            aria-current={route === id ? "page" : undefined}
            className={cx("relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold", route === id ? "text-brand-300" : "text-ink-400")}
          >
            {route === id && <span className="absolute top-0 h-0.5 w-8 rounded-b-full bg-brand-400" />}
            <span className="relative">
              <Icon className="size-5" />
              {id === "home" && (
                <span className={cx("absolute -right-1 -top-0.5 size-2 rounded-full ring-2 ring-ink-950", connected ? "bg-ok-400" : "bg-rose-400")} />
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
