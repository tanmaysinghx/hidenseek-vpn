import { Eye, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, EmptyState, ErrorNote, Spinner } from "../../components/ui";
import { dateTime } from "../../lib/format";
import { useResource } from "../../lib/hooks";
import { api } from "../../lib/ipc";
import type { ActivityEvent, AdminServer, Page, User } from "../../lib/types";

const PAGE_SIZE = 100;

export function Activity() {
  const users = useResource(() => api.get<User[]>("/api/v1/admin/users"));
  const servers = useResource(() => api.get<AdminServer[]>("/api/v1/admin/nodes"));
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const events = useResource(
    () => api.get<Page<ActivityEvent>>(`/api/v1/admin/activity?page=${page}&size=${PAGE_SIZE}${userId ? `&userId=${userId}` : ""}`),
    [userId, page],
    15000,
  );

  const email = (id: string) => users.data?.find((u) => u.id === id)?.email ?? id.slice(0, 8);
  const loggingServers = servers.data?.filter((s) => s.activityLogging).length ?? 0;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (events.data?.items ?? []).filter((e) => !q || e.domain.includes(q));
  }, [events.data, query]);
  const pages = events.data ? Math.max(1, Math.ceil(events.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      {servers.data && loggingServers === 0 && (
        <div className="card flex items-start gap-3 p-4 text-sm text-ink-300">
          <Eye className="mt-0.5 size-4 shrink-0 text-ink-400" />
          Activity logging is off on every server. Turn it on for a server under Servers to record DNS lookups. Records are deleted
          automatically after the retention period (ACTIVITY_RETENTION, 30 days by default).
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          value={userId}
          onChange={(e) => { setUserId(e.target.value); setPage(0); }}
          className="h-10 rounded-xl border border-white/10 bg-ink-950/60 px-3 text-sm outline-none focus:border-brand-400/50"
        >
          <option value="">Everyone</option>
          {users.data?.map((u) => (
            <option key={u.id} value={u.id}>{u.email}</option>
          ))}
        </select>
        <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-ink-950/60 px-3 focus-within:border-brand-400/50">
          <Search className="size-4 text-ink-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter domains on this page" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" />
        </label>
      </div>
      <ErrorNote error={events.error} />
      <div className="card overflow-hidden">
        {events.loading && !events.data ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Eye className="size-5" />} title="No activity recorded" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-white/5 text-xs text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Domain</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-400">{dateTime(e.occurredAt)}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5">{email(e.userId)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-brand-300">{e.domain}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-400">{e.queryType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
          <span className="text-xs text-ink-400">Page {page + 1} of {pages}</span>
          <Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      )}
    </div>
  );
}
