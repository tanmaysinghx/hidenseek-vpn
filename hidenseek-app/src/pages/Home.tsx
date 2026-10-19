import { ArrowDown, ArrowUp, Check, Clock, Eye, MapPin, Search, ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Flag } from "../components/Flag";
import { PowerButton, type Phase } from "../components/PowerButton";
import { Badge, Button, EmptyState, ErrorNote, Spinner, cx } from "../components/ui";
import { bytes, clock, countryName } from "../lib/format";
import { useAction, useNow, useResource } from "../lib/hooks";
import { api, ipc } from "../lib/ipc";
import type { AppView, Server } from "../lib/types";

const ACK_KEY = "hidenseek.activityAck";

function acknowledged(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ACK_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function Home({ app, onConnectedChange }: { app: AppView; onConnectedChange: (c: boolean) => void }) {
  const servers = useResource(() => api.get<Server[]>("/api/v1/nodes"), [], 15000);
  const status = useResource(() => ipc.status(), [], 2000);
  const action = useAction();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(app.lastNodeId);
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<Server | null>(null);
  const now = useNow();

  const up = status.data?.up ?? false;
  const effectivePhase: Phase = phase ?? (up ? "on" : "off");
  useEffect(() => onConnectedChange(up), [up, onConnectedChange]);

  const list = servers.data ?? [];
  const selected = list.find((s) => s.id === selectedId) ?? list.find((s) => s.online) ?? list[0] ?? null;
  const connectedId = status.data?.tunnel?.nodeId ?? (up ? app.lastNodeId : null);
  const connectedServer = list.find((s) => s.id === connectedId) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => [s.name, s.city, countryName(s.countryCode)].some((v) => v?.toLowerCase().includes(q)));
  }, [list, query]);

  const connect = async (server: Server) => {
    if (server.activityLogging && !acknowledged().includes(server.id)) {
      setConfirming(server);
      return;
    }
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
    else if (selected) void connect(selected);
  };

  const pick = (server: Server) => {
    setSelectedId(server.id);
    if (up && server.id !== connectedId) void connect(server);
  };

  const since = status.data?.since;
  const elapsed = since ? now / 1000 - since : 0;
  const shown = up ? connectedServer ?? selected : selected;

  const headline = {
    off: "Not protected",
    connecting: "Connecting…",
    on: "Protected",
    disconnecting: "Disconnecting…",
  }[effectivePhase];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="card relative flex flex-col items-center overflow-hidden px-6 pb-8 pt-10">
        <div
          className={cx(
            "pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b transition-colors duration-700",
            effectivePhase === "on" ? "from-brand-500/15" : "from-white/[0.02]",
            "to-transparent",
          )}
        />
        <div className="relative flex items-center gap-2 text-sm font-semibold">
          {effectivePhase === "on" ? <ShieldCheck className="size-4 text-brand-400" /> : <ShieldOff className="size-4 text-ink-400" />}
          <span className={effectivePhase === "on" ? "text-brand-300" : "text-ink-300"}>{headline}</span>
        </div>

        <div className="relative my-4">
          <PowerButton phase={effectivePhase} onClick={toggle} disabled={!selected} />
        </div>

        <div className="relative text-center">
          {shown ? (
            <div className="flex items-center justify-center gap-3">
              <Flag code={shown.countryCode} className="h-6 w-8" />
              <div className="text-left">
                <div className="font-semibold leading-tight">{shown.name}</div>
                <div className="text-xs text-ink-400">{[shown.city, countryName(shown.countryCode)].filter(Boolean).join(", ")}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-400">No servers available yet</p>
          )}
        </div>

        <div className="relative mt-8 grid w-full max-w-md grid-cols-3 gap-2">
          <Metric icon={<Clock className="size-4" />} label="Duration" value={up && since ? clock(elapsed) : "--:--:--"} />
          <Metric icon={<ArrowDown className="size-4" />} label="Download" value={up ? bytes(status.data!.rxBytes) : "—"} />
          <Metric icon={<ArrowUp className="size-4" />} label="Upload" value={up ? bytes(status.data!.txBytes) : "—"} />
        </div>

        {shown?.activityLogging && (
          <div className="relative mt-6 flex w-full max-w-md items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-3.5 py-3 text-xs text-amber-200">
            <Eye className="mt-0.5 size-4 shrink-0 text-amber-300" />
            <span>This server logs the website domains you visit (via DNS). Its admin can see them. Page contents stay encrypted.</span>
          </div>
        )}
        <ErrorNote error={action.error} className="relative mt-4 w-full max-w-md" />
        {status.data?.up && status.data.tunnel?.address && (
          <p className="relative mt-4 font-mono text-[11px] text-ink-400">
            Tunnel IP {status.data.tunnel.address.split("/")[0]} · {status.data.tunnel.endpoint}
          </p>
        )}
      </section>

      <section className="card flex min-h-[320px] flex-col">
        <div className="border-b border-white/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Locations</h2>
            <span className="text-xs text-ink-400">{list.filter((s) => s.online).length} online</span>
          </div>
          <label className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-ink-950/60 px-3 focus-within:border-brand-400/50">
            <Search className="size-4 text-ink-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search locations"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {servers.loading && !servers.data ? (
            <div className="grid place-items-center py-12">
              <Spinner />
            </div>
          ) : servers.error ? (
            <ErrorNote error={servers.error} className="m-2" />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<MapPin className="size-5" />} title={list.length ? "No matches" : "No servers yet"}>
              {list.length ? "Try a different search." : "An admin needs to add a server first."}
            </EmptyState>
          ) : (
            filtered.map((server) => {
              const active = server.id === connectedId && up;
              const isSelected = server.id === selected?.id;
              return (
                <button
                  key={server.id}
                  onClick={() => pick(server)}
                  disabled={!server.online}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-40",
                    isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]",
                  )}
                >
                  <Flag code={server.countryCode} className="h-6 w-8" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{server.name}</div>
                    <div className="truncate text-xs text-ink-400">{[server.city, countryName(server.countryCode)].filter(Boolean).join(", ")}</div>
                  </div>
                  {server.activityLogging && <Eye className="size-3.5 text-amber-300/80" aria-label="Logs activity" />}
                  {active ? (
                    <Badge tone="green" dot>Connected</Badge>
                  ) : !server.online ? (
                    <Badge>Offline</Badge>
                  ) : isSelected ? (
                    <Check className="size-4 text-brand-400" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </section>

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
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-3 text-center">
      <div className="mb-1 flex items-center justify-center gap-1 text-ink-400">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ConfirmLogging({ server, onAccept, onCancel }: { server: Server; onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div className="card w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-amber-500/10 text-amber-300">
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
