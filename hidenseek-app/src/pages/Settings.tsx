import { ChevronRight, Code2, LogOut, MapPin, Server, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Flag } from "../components/Flag";
import { Badge, Button, PageHeader } from "../components/ui";
import { countryName } from "../lib/format";
import { PICKABLE_CITIES, manualLocation, setManualLocation, type Place } from "../lib/geo";
import { useAction, useResource } from "../lib/hooks";
import { ipc } from "../lib/ipc";
import type { AppView, User } from "../lib/types";

export function SettingsPage({ app, me, onSignedOut, onChangeServer }: { app: AppView; me: User; onSignedOut: () => void; onChangeServer: () => void }) {
  const action = useAction();
  const version = useResource(() => getVersion().catch(() => "dev"));
  const signOut = async () => {
    await action.run(() => ipc.signOut());
    onSignedOut();
  };
  const initials = (me.displayName ?? me.email)
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("");

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <div className="card flex items-center gap-4 p-5">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold uppercase text-white shadow-lg shadow-brand-500/30">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-lg font-semibold">{me.displayName ?? me.email}</span>
              <Badge tone={me.role === "ADMIN" ? "purple" : "gray"}>{me.role === "ADMIN" ? "Admin" : "Member"}</Badge>
            </div>
            <div className="truncate text-sm text-ink-400">{me.email}</div>
          </div>
          <Button variant="danger" onClick={signOut} loading={action.pending} icon={<LogOut className="size-4" />} className="hidden sm:inline-flex">
            Sign out
          </Button>
        </div>

        <Group title="Location" icon={<MapPin className="size-4" />}>
          <LocationPicker />
        </Group>

        <Group title="Server" icon={<Server className="size-4" />}>
          <Row label="Backend" value={<span className="font-mono text-xs">{app.apiUrl}</span>} />
          <Row label="Sign-in portal" value={<span className="font-mono text-xs">{app.portalUrl}</span>} />
          <Row label="Platform" value={app.platform.charAt(0) + app.platform.slice(1).toLowerCase()} />
          <button onClick={onChangeServer} className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-medium text-brand-300 hover:bg-white/[0.03]">
            Use a different server
            <ChevronRight className="size-4" />
          </button>
        </Group>

        <Group title="Account" icon={<UserRound className="size-4" />}>
          <Row label="Name" value={me.displayName ?? "—"} />
          <Row label="Email" value={me.email} />
          <button onClick={signOut} className="flex w-full items-center justify-between px-4 py-3.5 text-left text-sm font-medium text-rose-300 hover:bg-rose-500/[0.06]">
            Sign out
            <LogOut className="size-4" />
          </button>
        </Group>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-xs text-ink-400">
          Hidenseek VPN {version.data ?? ""} · open source · <Code2 className="size-3.5" /> tanmaysinghx/hidenseek-vpn
        </p>
      </div>
    </>
  );
}

/** Pins "you" on the map to a city, when the network's guess is off (or there's no GeoIP on the server). */
function LocationPicker() {
  const [current, setCurrent] = useState<Place | null>(() => manualLocation());
  useEffect(() => {
    const sync = () => setCurrent(manualLocation());
    window.addEventListener("hidenseek:location", sync);
    return () => window.removeEventListener("hidenseek:location", sync);
  }, []);
  const groups = useMemo(() => {
    const byCountry = new Map<string, Place[]>();
    for (const p of PICKABLE_CITIES) byCountry.set(p.countryCode, [...(byCountry.get(p.countryCode) ?? []), p]);
    return [...byCountry.entries()].sort(([a], [b]) => countryName(a).localeCompare(countryName(b)));
  }, []);
  const value = current ? `${current.city}|${current.countryCode}` : "";

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Flag code={current?.countryCode} className="h-6 w-8 rounded" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Where the map shows you</div>
          <div className="text-xs text-ink-400">{current ? "Set by you" : "Detected from your network when you're not connected"}</div>
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => {
          const [city, cc] = e.target.value.split("|");
          setManualLocation(PICKABLE_CITIES.find((p) => p.city === city && p.countryCode === cc) ?? null);
        }}
        className="mt-3 h-11 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 text-sm text-ink-100 outline-none transition focus:border-brand-400/60 focus:ring-4 focus:ring-brand-400/10"
      >
        <option value="">Automatic</option>
        {groups.map(([cc, places]) => (
          <optgroup key={cc} label={countryName(cc)}>
            {places.map((p) => (
              <option key={`${p.city}|${cc}`} value={`${p.city}|${cc}`}>
                {p.city}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="mt-2 text-xs text-ink-400">Only used to draw the map. It stays on this device.</p>
    </div>
  );
}

function Group({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
        {icon}
        {title}
      </h2>
      <div className="card divide-y divide-white/[0.06] overflow-hidden">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5 text-sm">
      <span className="text-ink-400">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}
