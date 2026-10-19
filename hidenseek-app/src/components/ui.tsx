import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import type { AppError } from "../lib/types";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-ink-950 hover:bg-brand-400 shadow-lg shadow-brand-500/20",
  secondary: "bg-ink-700 text-ink-100 hover:bg-ink-600 border border-white/5",
  ghost: "text-ink-300 hover:text-ink-100 hover:bg-white/5",
  danger: "bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/20",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}) {
  const sizes = { sm: "h-8 px-3 text-xs gap-1.5", md: "h-10 px-4 text-sm gap-2", lg: "h-12 px-6 text-base gap-2" };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

const tones = {
  green: "bg-brand-500/10 text-brand-300 ring-brand-500/20",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
  red: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
  sky: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  gray: "bg-white/5 text-ink-300 ring-white/10",
};

export function Badge({ tone = "gray", children, dot }: { tone?: keyof typeof tones; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", tones[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-ink-400", className)} />;
}

export function ErrorNote({ error, className }: { error: AppError | null; className?: string }) {
  if (!error) return null;
  return (
    <div className={cx("flex items-start gap-2.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-sm text-rose-200 animate-fade-in", className)}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-400" />
      <span className="min-w-0 break-words">{error.message}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-white/5 text-ink-300">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-400">{children}</div>}
    </div>
  );
}

export function TextInput({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className={cx("block", className)}>
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-300">{label}</span>}
      <input
        className="h-11 w-full rounded-xl border border-white/10 bg-ink-950/60 px-3.5 text-sm text-ink-100 placeholder:text-ink-400 outline-none transition focus:border-brand-400/60 focus:ring-4 focus:ring-brand-400/10"
        {...props}
      />
      {hint && <span className="mt-1.5 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-brand-500" : "bg-ink-600",
      )}
    >
      <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
    </button>
  );
}

export function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-ink-950/70">
      <code className={cx("min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3.5 py-3 text-xs text-brand-300", mono && "font-mono")}>{value}</code>
      <button onClick={copy} className="flex shrink-0 items-center gap-1.5 border-l border-white/10 px-3 text-xs font-semibold text-ink-300 hover:bg-white/5 hover:text-ink-100">
        {copied ? <Check className="size-4 text-brand-400" /> : <Copy className="size-4" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {icon && <span className="text-ink-400">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}
