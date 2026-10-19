import { Ban, Check, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { Badge, Button, EmptyState, ErrorNote, Spinner, cx } from "../../components/ui";
import { relative } from "../../lib/format";
import { useAction, useResource } from "../../lib/hooks";
import { api } from "../../lib/ipc";
import type { User, UserStatus } from "../../lib/types";

const statusTone = { APPROVED: "green", PENDING: "amber", SUSPENDED: "red" } as const;
const filters = ["ALL", "PENDING", "APPROVED", "SUSPENDED"] as const;

export function Users({ me }: { me: User }) {
  const users = useResource(() => api.get<User[]>("/api/v1/admin/users"));
  const action = useAction();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");

  const setStatus = async (user: User, status: UserStatus) => {
    const updated = await action.run(() => api.patch<User>(`/api/v1/admin/users/${user.id}`, { status }));
    if (updated) users.setData((list) => list?.map((u) => (u.id === updated.id ? updated : u)) ?? null);
  };

  const list = (users.data ?? []).filter((u) => filter === "ALL" || u.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
              filter === f ? "bg-white/10 text-ink-100 ring-white/15" : "text-ink-400 ring-white/5 hover:text-ink-100",
            )}
          >
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            {f === "PENDING" && users.data && ` (${users.data.filter((u) => u.status === "PENDING").length})`}
          </button>
        ))}
      </div>
      <ErrorNote error={action.error ?? users.error} />
      <div className="card overflow-hidden">
        {users.loading && !users.data ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : list.length === 0 ? (
          <EmptyState icon={<UsersIcon className="size-5" />} title="Nobody here">
            People appear after they sign in to the app with Portal SSO.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-white/5">
            {list.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400/30 to-sky-brand/30 text-sm font-bold uppercase">
                  {(u.displayName ?? u.email).charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{u.displayName ?? u.email}</span>
                    <Badge tone={statusTone[u.status]}>{u.status.toLowerCase()}</Badge>
                    {u.role === "ADMIN" && <Badge tone="sky">admin</Badge>}
                  </div>
                  <div className="truncate text-xs text-ink-400">
                    {u.email} · seen {relative(u.lastSeenAt)}
                  </div>
                </div>
                {u.id !== me.id && (
                  <div className="flex gap-2">
                    {u.status !== "APPROVED" && (
                      <Button size="sm" variant="primary" onClick={() => setStatus(u, "APPROVED")} disabled={action.pending} icon={<Check className="size-3.5" />}>
                        Approve
                      </Button>
                    )}
                    {u.status !== "SUSPENDED" && (
                      <Button size="sm" variant="danger" onClick={() => setStatus(u, "SUSPENDED")} disabled={action.pending} icon={<Ban className="size-3.5" />}>
                        Suspend
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
