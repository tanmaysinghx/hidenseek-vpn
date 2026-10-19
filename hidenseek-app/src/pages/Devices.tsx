import { Laptop, MonitorSmartphone, Smartphone, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, ErrorNote, PageHeader, Spinner } from "../components/ui";
import { relative } from "../lib/format";
import { useAction, useResource } from "../lib/hooks";
import { api } from "../lib/ipc";
import type { Device } from "../lib/types";

const platformLabel: Record<Device["platform"], string> = {
  WINDOWS: "Windows",
  LINUX: "Linux",
  ANDROID: "Android",
  MACOS: "macOS",
  OTHER: "Other",
};

export function Devices({ currentDeviceId }: { currentDeviceId: string | null }) {
  const devices = useResource(() => api.get<Device[]>("/api/v1/devices"));
  const action = useAction();

  const remove = async (device: Device) => {
    const isCurrent = device.id === currentDeviceId;
    const message = isCurrent
      ? "Remove this device? It will register again with a new key next time you connect."
      : `Remove "${device.name}"? It will lose VPN access until it registers again.`;
    if (!window.confirm(message)) return;
    await action.run(() => api.del(`/api/v1/devices/${device.id}`));
    await devices.reload();
  };

  return (
    <>
      <PageHeader title="Devices" subtitle="Each device has its own WireGuard key. Its private key never leaves the device." />
      <ErrorNote error={action.error} className="mb-4" />
      <div className="card overflow-hidden">
        {devices.loading && !devices.data ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : devices.error ? (
          <ErrorNote error={devices.error} className="m-4" />
        ) : !devices.data?.length ? (
          <EmptyState icon={<MonitorSmartphone className="size-5" />} title="No devices yet">
            This device registers automatically the first time you connect.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-white/5">
            {devices.data.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3.5">
                <div className="grid size-10 place-items-center rounded-xl bg-white/5 text-ink-300">
                  {d.platform === "ANDROID" ? <Smartphone className="size-5" /> : <Laptop className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{d.name}</span>
                    {d.id === currentDeviceId && <Badge tone="sky">This device</Badge>}
                  </div>
                  <div className="truncate text-xs text-ink-400">
                    {platformLabel[d.platform]} · added {relative(d.createdAt)} · <span className="font-mono">{d.publicKey.slice(0, 10)}…</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(d)} aria-label={`Remove ${d.name}`} icon={<Trash2 className="size-4" />} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
