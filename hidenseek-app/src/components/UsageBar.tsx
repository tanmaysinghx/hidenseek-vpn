import { allowance, bytes, until } from "../lib/format";
import type { Usage } from "../lib/types";
import { cx } from "./ui";

/** Today's data use against the plan's allowance. */
export function UsageBar({ usage, compact, className }: { usage: Usage; compact?: boolean; className?: string }) {
  const unlimited = usage.limitBytes === null || usage.exempt;
  const pct = unlimited ? 0 : Math.min(100, (usage.usedBytes / usage.limitBytes!) * 100);
  const tone = usage.limited ? "bg-rose-400" : pct >= 80 ? "bg-amber-400" : "bg-brand-400";
  return (
    <div className={className}>
      <div className={cx("flex items-baseline justify-between gap-2", compact ? "text-xs" : "text-sm")}>
        <span>
          <span className="font-semibold tabular-nums text-ink-100">{bytes(usage.usedBytes)}</span>
          <span className="text-ink-400">
            {unlimited ? " used today" : ` of ${allowance(usage.limitBytes)} today`}
          </span>
        </span>
        <span className="text-ink-400">
          {usage.exempt ? "Admin · no limit" : unlimited ? "Unlimited" : `Resets ${until(usage.resetsAt)}`}
        </span>
      </div>
      {!unlimited && (
        <div
          className={cx("mt-2 overflow-hidden rounded-full bg-white/[0.07]", compact ? "h-1.5" : "h-2")}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Data used today"
        >
          <div className={cx("h-full rounded-full transition-[width] duration-700", tone)} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
        </div>
      )}
    </div>
  );
}
