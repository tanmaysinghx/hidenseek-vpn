import { Activity, ArrowDownUp, Server, UserCheck, Users } from "lucide-react";
import { Button, ErrorNote, Spinner, StatCard } from "../../components/ui";
import { bytes } from "../../lib/format";
import { useResource } from "../../lib/hooks";
import { api } from "../../lib/ipc";
import type { Stats } from "../../lib/types";

export function Overview({ onNavigate }: { onNavigate: (tab: "users" | "servers") => void }) {
  const stats = useResource(() => api.get<Stats>("/api/v1/admin/stats"), [], 10000);
  if (stats.loading && !stats.data) return <div className="grid place-items-center py-16"><Spinner /></div>;
  if (stats.error) return <ErrorNote error={stats.error} />;
  const s = stats.data!;
  return (
    <div className="space-y-4">
      {s.pendingUsers > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-500/20 bg-amber-500/[0.06] p-4">
          <div className="flex items-center gap-3">
            <UserCheck className="size-5 text-amber-300" />
            <span className="text-sm">
              <span className="font-semibold">{s.pendingUsers}</span> {s.pendingUsers === 1 ? "person is" : "people are"} waiting for approval
            </span>
          </div>
          <Button size="sm" onClick={() => onNavigate("users")}>Review</Button>
        </div>
      )}
      {s.nodes === 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-sm text-ink-300">Add your first server to start using the VPN.</span>
          <Button size="sm" variant="primary" onClick={() => onNavigate("servers")}>Add server</Button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Live sessions" value={s.activeSessions} icon={<Activity className="size-4" />} />
        <StatCard label="Servers online" value={`${s.onlineNodes}/${s.nodes}`} icon={<Server className="size-4" />} />
        <StatCard label="Users" value={s.users} icon={<Users className="size-4" />} hint={`${s.pendingUsers} pending`} />
        <StatCard label="Traffic · 24h" value={bytes(s.bytesLast24h)} icon={<ArrowDownUp className="size-4" />} hint={`${s.sessionsLast24h} sessions`} />
      </div>
    </div>
  );
}
