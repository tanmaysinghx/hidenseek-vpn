import { Check, Inbox, Pencil, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, Button, EmptyState, ErrorNote, Spinner, TextInput, cx } from "../../components/ui";
import { allowance, relative } from "../../lib/format";
import { useAction, useResource } from "../../lib/hooks";
import { api } from "../../lib/ipc";
import type { Plan, PlanRequest, PlanRequestStatus } from "../../lib/types";

const GB = 1024 ** 3;
const durations = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
  { days: null, label: "No end date" },
] as const;
const statusTone: Record<PlanRequestStatus, "amber" | "green" | "red" | "gray"> = {
  PENDING: "amber",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
};

/** Upgrade requests to approve or reject, and the plan catalogue. */
export function Plans() {
  const [showAll, setShowAll] = useState(false);
  const requests = useResource(() => api.get<PlanRequest[]>(`/api/v1/admin/plan-requests?pending=${!showAll}`), [showAll], 15000);
  const plans = useResource(() => api.get<Plan[]>("/api/v1/admin/plans"));
  const action = useAction();
  const [editing, setEditing] = useState<Plan | null>(null);

  const decide = async (r: PlanRequest, verb: "approve" | "reject", days: number | null) => {
    const note = verb === "reject" ? window.prompt(`Reject ${r.userName ?? r.userEmail}'s request for ${r.plan.name}? Add a note for them (optional):`, "") : "";
    if (note === null) return;
    await action.run(() => api.post(`/api/v1/admin/plan-requests/${r.id}/${verb}`, { days, note: note || null }));
    await requests.reload();
  };

  const save = async (plan: Plan, body: Pick<Plan, "name" | "description" | "dailyLimitBytes" | "priceLabel">) => {
    const updated = await action.run(() => api.put<Plan>(`/api/v1/admin/plans/${plan.id}`, body));
    if (updated) {
      plans.setData((list) => list?.map((p) => (p.id === updated.id ? updated : p)) ?? null);
      setEditing(null);
    }
  };

  const list = requests.data ?? [];

  return (
    <div className="space-y-6">
      <ErrorNote error={action.error ?? requests.error ?? plans.error} />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Requests</h2>
          <div className="inline-flex gap-1 rounded-lg bg-ink-950/60 p-0.5 ring-1 ring-white/5">
            {[false, true].map((all) => (
              <button
                key={String(all)}
                onClick={() => setShowAll(all)}
                className={cx("h-7 rounded-md px-2.5 text-xs font-semibold", showAll === all ? "bg-ink-700 text-ink-100" : "text-ink-400 hover:text-ink-100")}
              >
                {all ? "Recent" : "Pending"}
              </button>
            ))}
          </div>
        </div>
        <div className="card overflow-hidden">
          {requests.loading && !requests.data ? (
            <div className="grid place-items-center py-16"><Spinner /></div>
          ) : list.length === 0 ? (
            <EmptyState icon={<Inbox className="size-5" />} title={showAll ? "No requests yet" : "Nothing waiting"}>
              People request a bigger plan from the Plan screen in the app.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-white/5">
              {list.map((r) => <RequestRow key={r.id} request={r} busy={action.pending} onDecide={decide} />)}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Plans</h2>
        {plans.loading && !plans.data ? (
          <div className="grid place-items-center py-10"><Spinner /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {plans.data?.map((p) => (
              <div key={p.id} className="card flex flex-col p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  {p.isDefault && <Badge>default</Badge>}
                </div>
                <div className="mt-2 text-xl font-bold tracking-tight">
                  {allowance(p.dailyLimitBytes)}
                  {p.dailyLimitBytes !== null && <span className="text-sm font-normal text-ink-400"> / day</span>}
                </div>
                <div className="mt-0.5 text-xs text-ink-400">{p.priceLabel ?? "No price shown"}</div>
                {p.description && <p className="mt-2 text-xs text-ink-300">{p.description}</p>}
                <div className="mt-auto pt-3">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)} icon={<Pencil className="size-3.5" />}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-ink-400">
          Payment happens outside the app. Approve a request once you've been paid; the plan reverts to the default when it ends.
        </p>
      </section>

      {editing && <EditPlan plan={editing} pending={action.pending} onCancel={() => setEditing(null)} onSave={(body) => save(editing, body)} />}
    </div>
  );
}

function RequestRow({ request: r, busy, onDecide }: {
  request: PlanRequest;
  busy: boolean;
  onDecide: (r: PlanRequest, verb: "approve" | "reject", days: number | null) => void;
}) {
  const [days, setDays] = useState<number | null>(30);
  const pending = r.status === "PENDING";
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{r.userName ?? r.userEmail ?? "Deleted user"}</span>
          <span className="text-xs text-ink-400">wants</span>
          <Badge tone="purple">{r.plan.name}</Badge>
          {!pending && <Badge tone={statusTone[r.status]}>{r.status.toLowerCase()}</Badge>}
        </div>
        <div className="truncate text-xs text-ink-400">
          {r.userEmail} · {relative(r.createdAt)}
          {r.decidedBy && <> · by {r.decidedBy}</>}
        </div>
        {r.note && <p className="mt-1 text-xs text-ink-300">“{r.note}”</p>}
        {r.decisionNote && <p className="mt-1 text-xs text-ink-400">Reply: {r.decisionNote}</p>}
      </div>
      {pending && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={days ?? ""}
            onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}
            aria-label="How long the plan lasts"
            className="h-8 rounded-lg border border-white/10 bg-ink-950/60 px-2 text-xs font-semibold text-ink-100 outline-none focus:border-brand-400/60"
          >
            {durations.map((d) => <option key={d.label} value={d.days ?? ""}>{d.label}</option>)}
          </select>
          <Button size="sm" variant="primary" onClick={() => onDecide(r, "approve", days)} disabled={busy} icon={<Check className="size-3.5" />}>
            Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDecide(r, "reject", null)} disabled={busy} icon={<X className="size-3.5" />}>
            Reject
          </Button>
        </div>
      )}
    </li>
  );
}

function EditPlan({ plan, pending, onCancel, onSave }: {
  plan: Plan;
  pending: boolean;
  onCancel: () => void;
  onSave: (body: Pick<Plan, "name" | "description" | "dailyLimitBytes" | "priceLabel">) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? "");
  const [limitGb, setLimitGb] = useState(plan.dailyLimitBytes === null ? "" : String(+(plan.dailyLimitBytes / GB).toFixed(2)));
  const [price, setPrice] = useState(plan.priceLabel ?? "");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const gb = parseFloat(limitGb);
    onSave({
      name,
      description: description || null,
      dailyLimitBytes: limitGb.trim() && gb > 0 ? Math.round(gb * GB) : null,
      priceLabel: price || null,
    });
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-6 animate-rise" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Edit {plan.name}</h3>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
        <TextInput label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} />
        <TextInput
          label="Daily allowance (GB)"
          type="number"
          min="0.01"
          step="any"
          value={limitGb}
          onChange={(e) => setLimitGb(e.target.value)}
          placeholder="Unlimited"
          hint="Leave empty for unlimited. Applies to everyone on this plan straight away."
        />
        <TextInput label="Price shown to users" value={price} onChange={(e) => setPrice(e.target.value)} maxLength={64} placeholder="e.g. ₹99 / month" />
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1" loading={pending}>Save</Button>
        </div>
      </form>
    </div>
  );
}
