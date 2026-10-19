import { History as HistoryIcon } from "lucide-react";
import { Flag } from "../components/Flag";
import { Badge, EmptyState, ErrorNote, PageHeader, Spinner } from "../components/ui";
import { bytes, dateTime, duration, location } from "../lib/format";
import { useResource } from "../lib/hooks";
import { api } from "../lib/ipc";
import type { Page, Session } from "../lib/types";

export function HistoryPage() {
  const sessions = useResource(() => api.get<Page<Session>>("/api/v1/sessions?size=50"), [], 30000);
  return (
    <>
      <PageHeader title="History" subtitle="Your recent connections across all devices." />
      <div className="card overflow-hidden">
        {sessions.loading && !sessions.data ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : sessions.error ? (
          <ErrorNote error={sessions.error} className="m-4" />
        ) : !sessions.data?.items.length ? (
          <EmptyState icon={<HistoryIcon className="size-5" />} title="No connections yet">
            Sessions appear here once you connect.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-white/5">
            {sessions.data.items.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3.5">
                <Flag code={s.countryCode} className="h-6 w-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{location([s.city, s.region, s.country])}</span>
                    {s.active && <Badge tone="green" dot>Live</Badge>}
                  </div>
                  <div className="truncate text-xs text-ink-400">
                    {dateTime(s.startedAt)} · from {s.clientIp}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums">{duration(s.elapsedSeconds)}</div>
                  <div className="text-xs text-ink-400">{bytes(s.rxBytes + s.txBytes)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
