import { ArrowDown, ArrowUp, Clock, Eye, Loader2, MapPin, Power, Search, ShieldAlert, ShieldCheck, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flag } from "../components/Flag";
import { Button, EmptyState, ErrorNote, Spinner, cx } from "../components/ui";
import { WorldMap, type MapPhase, type MapPin as Pin } from "../components/WorldMap";
import { bytes, clock, countryName } from "../lib/format";
import { distanceKm, resolveMyLocation, serverCoords, type MyLocation } from "../lib/geo";
import { useAction, useNow, useResource } from "../lib/hooks";
import { api, ipc } from "../lib/ipc";
import type { AppView, Server, TunnelStatus } from "../lib/types";

const ACK_KEY = "hidenseek.activityAck";

function acknowledged(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ACK_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function useMyLocation(connected: boolean) {
  const [location, setLocation] = useState<MyLocation | null>(null);
  const refresh = useCallback(() => void resolveMyLocation(connected).then(setLocation), [connected]);
  useEffect(() => {
    refresh();
    window.addEventListener("hidenseek:location", refresh);
    return () => window.removeEventListener("hidenseek:location", refresh);
  }, [refresh]);
  return location;
}

/** Bytes per second from consecutive status polls. */
function useRates(status: TunnelStatus | null) {
  const last = useRef<{ rx: number; tx: number; t: number } | null>(null);
  const [rates, setRates] = useState({ down: 0, up: 0 });
  useEffect(() => {
    if (!status?.up) {
      last.current = null;
      setRates({ down: 0, up: 0 });
      return;
    }
    const now = Date.now();
    const prev = last.current;
    if (prev && now > prev.t) {
      const secs = (now - prev.t) / 1000;
      setRates({ down: Math.max(0, (status.rxBytes - prev.rx) / secs), up: Math.max(0, (status.txBytes - prev.tx) / secs) });
    }
    last.current = { rx: status.rxBytes, tx: status.txBytes, t: now };
  }, [status]);
  return rates;
}

const packets = (rate: number) => (rate < 1024 ? 1 : rate < 100 * 1024 ? 2 : rate < 1024 * 1024 ? 3 : 4);
const place = (city: string | null, cc: string | null) => [city, cc ? countryName(cc) : null].filter(Boolean).join(", ");

export function Home({ app, onConnectedChange }: { app: AppView; onConnectedChange: (c: boolean) => void }) {
  const servers = useResource(() => api.get<Server[]>("/api/v1/nodes"), [], 15000);
  const status = useResource(() => ipc.status(), [], 2000);
  const action = useAction();
  const [phase, setPhase] = useState<MapPhase | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(app.lastNodeId);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<Server | null>(null);
  const now = useNow();

  const up = status.data?.up ?? false;
  const effectivePhase: MapPhase = phase ?? (up ? "on" : "off");
  useEffect(() => onConnectedChange(up), [up, onConnectedChange]);
  const me = useMyLocation(up);
  const rates = useRates(status.data);

  const list = servers.data ?? [];
  const selected = list.find((s) => s.id === selectedId) ?? list.find((s) => s.online) ?? list[0] ?? null;
  const connectedId = status.data?.tunnel?.nodeId ?? (up ? app.lastNodeId : null);
  const connectedServer = list.find((s) => s.id === connectedId) ?? null;
  const shown = up ? connectedServer ?? selected : selected;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...list].sort((a, b) => Number(b.online) - Number(a.online) || countryName(a.countryCode).localeCompare(countryName(b.countryCode)));
    if (!q) return sorted;
    return sorted.filter((s) => [s.name, s.city, countryName(s.countryCode), s.countryCode].some((v) => v?.toLowerCase().includes(q)));
  }, [list, query]);

  const pins: Pin[] = useMemo(
    () => list.flatMap((s) => {
      const coords = serverCoords(s);
      return coords ? [{ id: s.id, name: s.city ?? s.name, coords, online: s.online }] : [];
    }),
    [list],
  );

  const connect = async (server: Server) => {
    if (server.activityLogging && !acknowledged().includes(server.id)) {
      setConfirming(server);
      return;
    }
    setSelectedId(server.id);
    setPhase("connecting");
    await action.run(() => ipc.connect(server.id));
    await status.reload();
    setPhase(null);
  };

  const disconnect = async () => {
    setPhase("disconnecting");
    await action.run(() => ipc.disconnect());
    await status.reload();
    setPhase(null);
  };

  const toggle = () => {
    if (effectivePhase === "on") void disconnect();
    else if (effectivePhase === "off" && shown) void connect(shown);
  };

  const since = status.data?.since;
  const elapsed = since ? now / 1000 - since : 0;
  const meLabel = me ? (me.city ? `You · ${me.city}` : `You · ${countryName(me.countryCode)}`) : "You";
  const shownCoords = shown ? serverCoords(shown) : null;
  const km = me && shownCoords ? Math.round(distanceKm(me.coords, shownCoords)) : null;

  return (
    <div className="flex min-h-full flex-col md:h-full md:flex-row">
      {/* Map: the top of the screen on phones, everything right of the panel on desktop */}
      <div className="relative h-[46vh] min-h-[300px] shrink-0 md:order-2 md:h-auto md:min-h-0 md:flex-1">
        <WorldMap
          me={me?.coords ?? null}
          meLabel={meLabel}
          pins={pins}
          targetId={shown?.id ?? null}
          phase={effectivePhase}
          flow={{ down: packets(rates.down), up: packets(rates.up) }}
          obscuredBottom={0.18}
          onPick={(id) => {
            const server = list.find((s) => s.id === id);
            if (server) pick(server);
          }}
        />
        {me && shown && (
          <div className="glass absolute left-1/2 top-4 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium md:left-6 md:translate-x-0">
            <span className="truncate text-ink-300">{me.city ?? countryName(me.countryCode)}</span>
            <RouteDots phase={effectivePhase} />
            <span className={cx("truncate", effectivePhase === "on" ? "text-ok-300" : "text-ink-100")}>{shown.city ?? shown.name}</span>
            {km !== null && <span className="hidden text-ink-400 sm:inline">· {km.toLocaleString()} km</span>}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-ink-900 to-transparent md:hidden" />
      </div>

      {/* Panel */}
      <aside className="relative z-10 -mt-24 flex flex-col px-3 pb-4 md:order-1 md:mt-0 md:w-[380px] md:shrink-0 md:border-r md:border-white/[0.06] md:bg-ink-850 md:p-0">
        <StatusCard
          phase={effectivePhase}
          me={me}
          server={shown}
          status={status.data}
          elapsed={up && since ? elapsed : 0}
          rates={rates}
          onToggle={toggle}
          canConnect={Boolean(shown?.online)}
        />
        <div className="px-1 md:px-4">
          {shown?.activityLogging && (
            <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.07] px-3 py-2.5 text-xs text-amber-200">
              <Eye className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <span>This server logs the website domains you visit (via DNS). Its admin can see them. Page contents stay encrypted.</span>
            </div>
          )}
          <ErrorNote error={action.error} className="mt-3" />
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col md:mt-2 md:border-t md:border-white/[0.06]">
          <div className="px-1 pb-2 pt-1 md:px-4 md:pt-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Countries</h2>
              <span className="text-xs text-ink-400">{list.filter((s) => s.online).length} of {list.length} online</span>
            </div>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.08] bg-ink-950/50 px-3 transition focus-within:border-brand-400/60 focus-within:ring-4 focus-within:ring-brand-400/10">
              <Search className="size-4 text-ink-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search countries and cities"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
              />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto px-0 pb-2 md:px-2">
            {servers.loading && !servers.data ? (
              <div className="grid place-items-center py-12"><Spinner /></div>
            ) : servers.error ? (
              <ErrorNote error={servers.error} className="m-2" />
            ) : filtered.length === 0 ? (
              <EmptyState icon={<MapPin className="size-5" />} title={list.length ? "No matches" : "No servers yet"}>
                {list.length ? "Try a different search." : "An admin needs to add a server first."}
              </EmptyState>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((server) => (
                  <ServerRow
                    key={server.id}
                    server={server}
                    selected={server.id === shown?.id}
                    active={up && server.id === connectedId}
                    busy={effectivePhase === "connecting" && server.id === shown?.id}
                    km={me ? kmTo(me, server) : null}
                    onSelect={() => pick(server)}
                    onConnect={() => (up && server.id === connectedId ? void disconnect() : void connect(server))}
                    disabled={effectivePhase === "connecting" || effectivePhase === "disconnecting"}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>

      {confirming && (
        <ConfirmLogging
          server={confirming}
          onCancel={() => setConfirming(null)}
          onAccept={() => {
            localStorage.setItem(ACK_KEY, JSON.stringify([...acknowledged(), confirming.id]));
            const server = confirming;
            setConfirming(null);
            void connect(server);
          }}
        />
      )}
    </div>
  );

  function pick(server: Server) {
    setSelectedId(server.id);
    if (up && server.id !== connectedId) void connect(server);
  }
}

function kmTo(me: MyLocation, server: Server) {
  const c = serverCoords(server);
  return c ? Math.round(distanceKm(me.coords, c)) : null;
}

function RouteDots({ phase }: { phase: MapPhase }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cx("size-1 rounded-full", phase === "on" ? "bg-ok-400" : phase === "connecting" ? "bg-brand-300 animate-pulse" : "bg-ink-400")}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

function StatusCard({
  phase,
  me,
  server,
  status,
  elapsed,
  rates,
  onToggle,
  canConnect,
}: {
  phase: MapPhase;
  me: MyLocation | null;
  server: Server | null;
  status: TunnelStatus | null;
  elapsed: number;
  rates: { down: number; up: number };
  onToggle: () => void;
  canConnect: boolean;
}) {
  const on = phase === "on";
  const busy = phase === "connecting" || phase === "disconnecting";
  const tone = on ? "ok" : busy ? "brand" : "danger";
  return (
    <section className="glass relative overflow-hidden rounded-2xl md:rounded-none md:border-0 md:border-b md:border-white/[0.06] md:bg-transparent md:shadow-none md:backdrop-blur-none">
      <div
        className={cx(
          "pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b to-transparent transition-colors duration-700",
          tone === "ok" ? "from-ok-500/25" : tone === "brand" ? "from-brand-500/25" : "from-rose-500/20",
        )}
      />
      <div className="relative p-4 md:p-5">
        <div className="flex items-center gap-2">
          {on ? (
            <ShieldCheck className="size-5 text-ok-400" />
          ) : busy ? (
            <Loader2 className="size-5 animate-spin text-brand-300" />
          ) : (
            <ShieldAlert className="size-5 text-rose-400" />
          )}
          <span className={cx("text-sm font-bold uppercase tracking-[0.12em]", on ? "text-ok-300" : busy ? "text-brand-300" : "text-rose-300")}>
            {on ? "Protected" : phase === "connecting" ? "Connecting" : phase === "disconnecting" ? "Disconnecting" : "Unprotected"}
          </span>
        </div>

        <div className="mt-3 min-h-[44px]">
          {on || phase === "connecting" ? (
            server && (
              <div className="flex items-center gap-3 animate-fade-in">
                <Flag code={server.countryCode} className="h-7 w-10 rounded" />
                <div className="min-w-0">
                  <div className="truncate font-semibold leading-tight">{countryName(server.countryCode)}</div>
                  <div className="truncate text-xs text-ink-400">
                    {server.name}
                    {server.city ? ` · ${server.city}` : ""}
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="animate-fade-in text-sm">
              <div className="text-ink-300">
                Your location: <span className="font-medium text-ink-100">{me ? place(me.city, me.countryCode) : "Unknown"}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                {me?.ip ? <>Your IP <span className="font-mono text-ink-300">{me.ip}</span> is visible to websites</> : "Your traffic is not encrypted"}
              </div>
            </div>
          )}
        </div>

        {on && status && (
          <div className="mt-4 grid grid-cols-3 gap-2 animate-fade-in">
            <Metric icon={<Clock className="size-3.5" />} label="Session" value={clock(elapsed)} />
            <Metric icon={<ArrowDown className="size-3.5 text-ok-400" />} label="Down" value={`${bytes(rates.down)}/s`} hint={bytes(status.rxBytes)} />
            <Metric icon={<ArrowUp className="size-3.5 text-brand-300" />} label="Up" value={`${bytes(rates.up)}/s`} hint={bytes(status.txBytes)} />
          </div>
        )}
        {phase === "connecting" && (
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-brand-400 to-transparent animate-sheen" />
          </div>
        )}

        <Button
          variant={on ? "secondary" : "primary"}
          size="lg"
          className={cx("mt-4 w-full", on && "hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-200")}
          onClick={onToggle}
          disabled={busy || (!on && !canConnect)}
          loading={busy}
          icon={!busy && (on ? <Power className="size-4" /> : <Zap className="size-4" />)}
        >
          {on ? "Disconnect" : phase === "connecting" ? "Connecting…" : phase === "disconnecting" ? "Disconnecting…" : server ? `Connect to ${server.city ?? server.name}` : "Quick connect"}
        </Button>
        {on && status?.tunnel && (
          <p className="mt-2.5 truncate text-center font-mono text-[11px] text-ink-400">
            {status.tunnel.address.split("/")[0]} · via {status.tunnel.endpoint}
          </p>
        )}
      </div>
    </section>
  );
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
      <div className="flex items-center gap-1 text-[11px] font-medium text-ink-400">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-[13px] font-semibold tabular-nums">{value}</div>
      {hint && <div className="truncate text-[10px] text-ink-400">{hint} total</div>}
    </div>
  );
}

function ServerRow({
  server,
  selected,
  active,
  busy,
  km,
  onSelect,
  onConnect,
  disabled,
}: {
  server: Server;
  selected: boolean;
  active: boolean;
  busy: boolean;
  km: number | null;
  onSelect: () => void;
  onConnect: () => void;
  disabled: boolean;
}) {
  return (
    <li
      className={cx(
        "group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        !server.online && "opacity-45",
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.035]",
      )}
    >
      <button onClick={onSelect} disabled={!server.online} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed">
        <span className="relative">
          <Flag code={server.countryCode} className="h-6 w-8 rounded" />
          {active && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-ok-400 ring-2 ring-ink-850" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{countryName(server.countryCode)}</span>
          <span className="block truncate text-xs text-ink-400">
            {server.city ?? server.name}
            {server.city && server.name !== server.city ? ` · ${server.name}` : ""}
            {km !== null && server.online ? ` · ${km.toLocaleString()} km` : ""}
            {!server.online && " · Offline"}
          </span>
        </span>
        {server.activityLogging && <Eye className="size-3.5 shrink-0 text-amber-300/80" aria-label="Logs activity" />}
      </button>
      {server.online && (
        <button
          onClick={onConnect}
          disabled={disabled}
          aria-label={active ? `Disconnect from ${server.name}` : `Connect to ${server.name}`}
          className={cx(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:cursor-not-allowed",
            active
              ? "bg-ok-500/15 text-ok-300 ring-1 ring-ok-500/30 hover:bg-rose-500/15 hover:text-rose-200 hover:ring-rose-500/30"
              : busy
                ? "bg-brand-500/20 text-white ring-1 ring-brand-400/40"
                : "bg-white/[0.06] text-ink-100 ring-1 ring-white/10 hover:bg-brand-500 hover:ring-brand-500 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100",
            selected && !active && !busy && "md:opacity-100",
          )}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
          {active ? "Connected" : busy ? "Connecting" : "Connect"}
        </button>
      )}
    </li>
  );
}

function ConfirmLogging({ server, onAccept, onCancel }: { server: Server; onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className="card w-full max-w-sm p-6 animate-rise" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 grid size-11 place-items-center rounded-xl bg-amber-500/10 text-amber-300">
          <Eye className="size-5" />
        </div>
        <h3 className="text-lg font-semibold">This server logs activity</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          <span className="font-semibold text-ink-100">{server.name}</span> records the domain names you look up (for example
          <span className="font-mono"> youtube.com</span>) along with your account. The server's admin can see this list. The
          contents of encrypted (HTTPS) pages are not visible.
        </p>
        <div className="mt-6 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={onAccept}>
            I understand
          </Button>
        </div>
      </div>
    </div>
  );
}
