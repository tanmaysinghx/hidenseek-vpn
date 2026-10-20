import { Check, Clock, Crown, Gauge, Infinity as InfinityIcon, Sparkles, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { UsageBar } from "../components/UsageBar";
import { Badge, Button, ErrorNote, PageHeader, Spinner, cx } from "../components/ui";
import { allowance, relative } from "../lib/format";
import { useAction, useResource } from "../lib/hooks";
import { api } from "../lib/ipc";
import type { MyPlan, Plan } from "../lib/types";

const icons: Record<string, typeof Gauge> = { FREE: Gauge, PLUS: Sparkles, PRO: Crown };

export function PlanPage() {
  const mine = useResource(() => api.get<MyPlan>("/api/v1/me/plan"), [], 30000);
  const plans = useResource(() => api.get<Plan[]>("/api/v1/plans"));
  const action = useAction();
  const [asking, setAsking] = useState<Plan | null>(null);

  const choose = async (plan: Plan, note?: string) => {
    const next = await action.run(() => api.post<MyPlan>("/api/v1/me/plan-requests", { planId: plan.id, note: note ?? null }));
    if (next) mine.setData(next);
    setAsking(null);
  };
  const cancel = async () => {
    await action.run(() => api.del("/api/v1/me/plan-requests/pending"));
    await mine.reload();
  };

  if ((mine.loading && !mine.data) || (plans.loading && !plans.data)) {
    return <div className="grid place-items-center py-24"><Spinner /></div>;
  }
  const m = mine.data;
  const pending = m?.pendingRequest ?? null;

  return (
    <>
      <PageHeader title="Your plan" subtitle="Every plan works on all servers and devices. Data allowances reset every night at midnight." />
      <ErrorNote error={mine.error ?? plans.error ?? action.error} className="mb-4" />

      {m && (
        <section className="card relative mb-6 overflow-hidden p-5">
          <div className={cx("pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent", m.usage.limited ? "from-rose-500/15" : "from-brand-500/15")} />
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Current plan</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold">{m.plan.name}</span>
                <Badge tone="purple">{allowance(m.plan.dailyLimitBytes)}{m.plan.dailyLimitBytes !== null && " / day"}</Badge>
              </div>
              {m.expiresAt && <div className="mt-1 text-xs text-ink-400">Until {new Date(m.expiresAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, then back to Free</div>}
            </div>
            {m.usage.limited && <Badge tone="red" dot>VPN paused for today</Badge>}
          </div>
          <UsageBar usage={m.usage} className="relative mt-5" />
          {m.usage.limited && (
            <p className="relative mt-3 text-sm text-rose-200">
              You've used today's allowance, so your VPN is paused until midnight. Request a bigger plan below to keep going.
            </p>
          )}
        </section>
      )}

      {pending && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-brand-400/25 bg-brand-500/[0.08] px-4 py-3.5 animate-fade-in">
          <Clock className="size-5 shrink-0 text-brand-300" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{pending.plan.name}</span> requested {relative(pending.createdAt)}. An admin will switch you over once it's approved.
          </div>
          <Button size="sm" variant="ghost" onClick={cancel} loading={action.pending} icon={<X className="size-3.5" />}>
            Cancel request
          </Button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.data?.map((plan) => {
          const Icon = icons[plan.code] ?? Sparkles;
          const current = m?.plan.id === plan.id;
          const requested = pending?.plan.id === plan.id;
          const featured = plan.code === "PLUS";
          return (
            <article
              key={plan.id}
              className={cx(
                "card relative flex flex-col p-5 transition",
                current ? "border-brand-400/50 ring-1 ring-brand-400/30" : featured ? "border-white/10" : "",
              )}
            >
              {featured && !current && <span className="absolute -top-2.5 right-4 rounded-full bg-brand-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Popular</span>}
              <div className="flex items-center gap-3">
                <div className={cx("grid size-10 place-items-center rounded-xl", current ? "bg-brand-500 text-white" : "bg-white/[0.06] text-brand-300")}>
                  <Icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{plan.name}</h3>
                  <div className="text-xs text-ink-400">{plan.priceLabel ?? (plan.isDefault ? "Free" : "Ask your admin")}</div>
                </div>
              </div>
              <div className="mt-5 flex items-baseline gap-1">
                {plan.dailyLimitBytes === null ? (
                  <span className="flex items-center gap-2 text-3xl font-bold tracking-tight"><InfinityIcon className="size-8" /> Unlimited</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold tracking-tight">{allowance(plan.dailyLimitBytes)}</span>
                    <span className="text-sm text-ink-400">/ day</span>
                  </>
                )}
              </div>
              {plan.description && <p className="mt-2 text-sm text-ink-300">{plan.description}</p>}
              <ul className="mt-4 space-y-1.5 text-sm text-ink-300">
                {["All server locations", "All your devices", "WireGuard encryption"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="size-4 text-ok-400" />{f}</li>
                ))}
              </ul>
              <div className="mt-auto pt-5">
                {current ? (
                  <Button className="w-full" disabled>Current plan</Button>
                ) : requested ? (
                  <Button className="w-full" disabled icon={<Clock className="size-4" />}>Waiting for approval</Button>
                ) : plan.isDefault ? (
                  <Button className="w-full" onClick={() => choose(plan)} disabled={action.pending}>Switch to {plan.name}</Button>
                ) : (
                  <Button variant="primary" className="w-full" onClick={() => setAsking(plan)} disabled={action.pending}>
                    Request {plan.name}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {asking && <RequestDialog plan={asking} pending={action.pending} onCancel={() => setAsking(null)} onSubmit={(note) => choose(asking, note)} />}
    </>
  );
}

function RequestDialog({ plan, pending, onCancel, onSubmit }: { plan: Plan; pending: boolean; onCancel: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(note);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <form onSubmit={submit} className="card w-full max-w-md p-6 animate-rise" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Request {plan.name}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-300">
          An admin reviews each request{plan.priceLabel ? <> ({plan.priceLabel})</> : null}. Your plan changes as soon as it's approved; until then you stay on your current one.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-medium text-ink-300">Message for the admin <span className="text-ink-400">(optional)</span></span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. Paid via UPI, reference 4821…"
            className="w-full resize-none rounded-lg border border-white/10 bg-ink-950/60 px-3.5 py-2.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-400 focus:border-brand-400/60 focus:ring-4 focus:ring-brand-400/10"
          />
        </label>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1" loading={pending}>Send request</Button>
        </div>
      </form>
    </div>
  );
}
