import { Plus, Server as ServerIcon, Terminal, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Flag } from "../../components/Flag";
import { Badge, Button, CopyField, EmptyState, ErrorNote, Spinner, TextInput, Toggle } from "../../components/ui";
import { countryName, relative } from "../../lib/format";
import { useAction, useResource } from "../../lib/hooks";
import { api } from "../../lib/ipc";
import type { AdminServer, Enrollment } from "../../lib/types";

export function Servers() {
  const servers = useResource(() => api.get<AdminServer[]>("/api/v1/admin/nodes"), [], 5000);
  const action = useAction();
  const [adding, setAdding] = useState(false);
  const [enrollment, setEnrollment] = useState<{ server: AdminServer; data: Enrollment } | null>(null);

  const replace = (updated: AdminServer) =>
    servers.setData((list) => list?.map((s) => (s.id === updated.id ? updated : s)) ?? null);

  const patch = async (server: AdminServer, body: Partial<AdminServer>) => {
    const updated = await action.run(() => api.patch<AdminServer>(`/api/v1/admin/nodes/${server.id}`, body));
    if (updated) replace(updated);
  };

  const install = async (server: AdminServer) => {
    const data = await action.run(() => api.post<Enrollment>(`/api/v1/admin/nodes/${server.id}/enrollment`));
    if (data) setEnrollment({ server, data });
  };

  const remove = async (server: AdminServer) => {
    if (!window.confirm(`Delete "${server.name}"? Its sessions and activity history are deleted too. Run "systemctl disable --now hidenseek-agent" on the VPS afterwards.`)) return;
    await action.run(() => api.del(`/api/v1/admin/nodes/${server.id}`));
    await servers.reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setAdding(true)} icon={<Plus className="size-4" />}>
          Add server
        </Button>
      </div>
      <ErrorNote error={action.error ?? servers.error} />
      {servers.loading && !servers.data ? (
        <div className="grid place-items-center py-16"><Spinner /></div>
      ) : !servers.data?.length ? (
        <div className="card">
          <EmptyState icon={<ServerIcon className="size-5" />} title="No servers yet">
            Add a server, then run the one-line install command on your VPS. Any Linux VPS with kernel 5.6+ works.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {servers.data.map((s) => (
            <article key={s.id} className="card p-5">
              <div className="flex items-start gap-3">
                <Flag code={s.countryCode} className="h-7 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-semibold">{s.name}</h3>
                    {s.status === "PENDING" ? (
                      <Badge tone="amber">Awaiting install</Badge>
                    ) : s.online ? (
                      <Badge tone="green" dot>Online</Badge>
                    ) : (
                      <Badge tone="red" dot>Offline</Badge>
                    )}
                  </div>
                  <p className="truncate text-xs text-ink-400">
                    {[s.city, countryName(s.countryCode)].filter(Boolean).join(", ")}
                    {s.endpointHost && <> · <span className="font-mono">{s.endpointHost}:{s.listenPort}</span></>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(s)} aria-label={`Delete ${s.name}`} icon={<Trash2 className="size-4" />} />
              </div>

              <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Mini label="Live" value={s.activeSessions} />
                <Mini label="Peers" value={s.peerCount} />
                <Mini label="Seen" value={s.status === "PENDING" ? "—" : relative(s.lastHeartbeatAt)} />
              </dl>

              <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                <Setting label="Enabled" hint="Disabled servers drop all peers and are hidden from users.">
                  <Toggle label="Enabled" checked={s.enabled} onChange={(v) => patch(s, { enabled: v })} />
                </Setting>
                <Setting label="Log activity" hint="Record DNS lookups (domains) per user.">
                  <Toggle label="Log activity" checked={s.activityLogging} onChange={(v) => patch(s, { activityLogging: v })} />
                </Setting>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 text-xs text-ink-400">
                <span className="font-mono">{s.addressCidr}{s.agentVersion && ` · agent ${s.agentVersion}`}</span>
                <Button size="sm" onClick={() => install(s)} icon={<Terminal className="size-3.5" />}>
                  {s.status === "PENDING" ? "Install command" : "Reinstall"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {adding && (
        <AddServer
          onClose={() => setAdding(false)}
          onCreated={async (server) => {
            setAdding(false);
            await servers.reload();
            await install(server);
          }}
        />
      )}
      {enrollment && <InstallDialog {...enrollment} onClose={() => setEnrollment(null)} />}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/[0.03] py-2">
      <dt className="text-[11px] text-ink-400">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Setting({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-ink-400">{hint}</div>
      </div>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-ink-400 hover:bg-white/5 hover:text-ink-100" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddServer({ onClose, onCreated }: { onClose: () => void; onCreated: (s: AdminServer) => void }) {
  const [form, setForm] = useState({ name: "", countryCode: "", city: "", endpointHost: "", listenPort: "51820", addressCidr: "10.66.0.0/24" });
  const [logging, setLogging] = useState(false);
  const action = useAction();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const created = await action.run(() =>
      api.post<AdminServer>("/api/v1/admin/nodes", {
        name: form.name,
        countryCode: form.countryCode,
        city: form.city || null,
        endpointHost: form.endpointHost || null,
        listenPort: Number(form.listenPort) || 51820,
        addressCidr: form.addressCidr,
        activityLogging: logging,
      }),
    );
    if (created) onCreated(created);
  };

  return (
    <Modal title="Add a server" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <TextInput label="Name" placeholder="Singapore 1" value={form.name} onChange={set("name")} required className="col-span-2" />
          <TextInput label="Country code" placeholder="SG" maxLength={2} value={form.countryCode} onChange={set("countryCode")} required />
          <TextInput label="City" placeholder="Singapore" value={form.city} onChange={set("city")} />
          <TextInput
            label="Public host"
            placeholder="Auto-detect"
            value={form.endpointHost}
            onChange={set("endpointHost")}
            hint="Domain or IP clients dial. Leave blank to detect."
            className="col-span-2"
          />
          <TextInput label="UDP port" inputMode="numeric" value={form.listenPort} onChange={set("listenPort")} />
          <TextInput label="Tunnel subnet" value={form.addressCidr} onChange={set("addressCidr")} />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.03] p-3">
          <div>
            <div className="text-sm font-medium">Log activity</div>
            <div className="text-xs text-ink-400">Off by default. Users see a notice before connecting.</div>
          </div>
          <Toggle label="Log activity" checked={logging} onChange={setLogging} />
        </div>
        <ErrorNote error={action.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={action.pending}>Create and get install command</Button>
        </div>
      </form>
    </Modal>
  );
}

function InstallDialog({ server, data, onClose }: { server: AdminServer; data: Enrollment; onClose: () => void }) {
  return (
    <Modal title={`Install on ${server.name}`} onClose={onClose}>
      <ol className="space-y-4 text-sm">
        <li>
          <p className="mb-2 text-ink-300"><span className="font-semibold text-ink-100">1.</span> SSH into the VPS and run this as root:</p>
          <CopyField value={data.installCommand} />
          <p className="mt-1.5 text-xs text-ink-400">
            Single use; expires {new Date(data.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
          </p>
        </li>
        <li className="text-ink-300">
          <span className="font-semibold text-ink-100">2.</span> Allow <span className="font-mono text-ink-100">UDP {server.listenPort}</span> in your
          cloud provider's firewall.
        </li>
        <li className="text-ink-300">
          <span className="font-semibold text-ink-100">3.</span> The server shows <Badge tone="green" dot>Online</Badge> here within a few seconds.
        </li>
      </ol>
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
