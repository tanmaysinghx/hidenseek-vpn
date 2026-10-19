import { Activity as ActivityIcon } from "lucide-react";
import { useState } from "react";
import { Flag } from "../../components/Flag";
import { Badge, Button, EmptyState, ErrorNote, Spinner, Toggle } from "../../components/ui";
import { bytes, dateTime, duration, location } from "../../lib/format";
import { useResource } from "../../lib/hooks";
import { api } from "../../lib/ipc";
import type { AdminServer, Page, Session } from "../../lib/types";

const PAGE_SIZE = 50;

export function Sessions() {
  const [liveOnly, setLiveOnly] = useState(false);
  const [page, setPage] = useState(0);
  const sessions = useResource(
    () => api.get<Page<Session>>(`/api/v1/admin/sessions?active=${liveOnly}&page=${page}&size=${PAGE_SIZE}`),
    [liveOnly, page],
    10000,
  );
  const servers = useResource(() => api.get<AdminServer[]>("/api/v1/admin/nodes"));
  const serverName = (id: string) => servers.data?.find((s) => s.id === id)?.name ?? "—";
  const data = sessions.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2.5 text-sm text-ink-300">
          <Toggle label="Live only" checked={liveOnly} onChange={(v) => { setLiveOnly(v); setPage(0); }} />
          Live only
        </label>
        {data && <span className="text-xs text-ink-400">{data.total} sessions</span>}
      </div>
      <ErrorNote error={sessions.error} />
      <div className="card overflow-hidden">
        {sessions.loading && !data ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : !data?.items.length ? (
          <EmptyState icon={<ActivityIcon className="size-5" />} title={liveOnly ? "Nobody is connected" : "No sessions yet"} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-white/5 text-xs text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">Server</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 text-right font-medium">Duration</th>
                  <th className="px-4 py-3 text-right font-medium">↓ / ↑</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.items.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[200px] truncate font-medium">{s.userEmail}</span>
                        {s.active && <Badge tone="green" dot>Live</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Flag code={s.countryCode} className="h-4 w-6 rounded-sm" />
                        <div className="min-w-0">
                          <div className="max-w-[200px] truncate">{location([s.city, s.region, s.country])}</div>
                          <div className="font-mono text-xs text-ink-400">{s.clientIp}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-300">{serverName(s.nodeId)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-300">{dateTime(s.startedAt)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{duration(s.elapsedSeconds)}</td>
                    {/* Server-side counters: tx is what the client downloaded. */}
                    <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs tabular-nums text-ink-300">
                      {bytes(s.txBytes)} / {bytes(s.rxBytes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-xs text-ink-400">Page {page + 1} of {pages}</span>
          <Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
