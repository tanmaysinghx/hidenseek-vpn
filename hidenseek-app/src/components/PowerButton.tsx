import { Power } from "lucide-react";
import { cx } from "./ui";

export type Phase = "off" | "connecting" | "on" | "disconnecting";

export function PowerButton({ phase, onClick, disabled }: { phase: Phase; onClick: () => void; disabled?: boolean }) {
  const on = phase === "on";
  const busy = phase === "connecting" || phase === "disconnecting";
  return (
    <div className="relative grid size-52 place-items-center sm:size-60">
      {on && <span className="absolute inset-6 rounded-full bg-brand-400/30 animate-pulse-ring" />}
      {busy && <span className="absolute inset-3 rounded-full border-2 border-dashed border-sky-400/40 animate-[spin_6s_linear_infinite]" />}
      <div
        className={cx(
          "absolute inset-5 rounded-full blur-2xl transition-opacity duration-700",
          on ? "bg-brand-500/30 opacity-100" : busy ? "bg-sky-500/20 opacity-100" : "opacity-0",
        )}
      />
      <button
        onClick={onClick}
        disabled={disabled || busy}
        aria-label={on ? "Disconnect" : "Connect"}
        className={cx(
          "relative grid size-40 place-items-center rounded-full border transition-all duration-500 sm:size-44",
          "disabled:cursor-not-allowed",
          on
            ? "border-brand-300/40 bg-gradient-to-b from-brand-400 to-brand-500 text-ink-950 shadow-[0_20px_60px_-15px] shadow-brand-500/70"
            : busy
              ? "border-sky-400/30 bg-ink-800 text-sky-300"
              : "border-white/10 bg-gradient-to-b from-ink-700 to-ink-800 text-ink-300 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] hover:text-ink-100 hover:border-white/20",
        )}
      >
        <Power className={cx("size-14 transition-transform", busy && "animate-pulse")} strokeWidth={2.2} />
      </button>
    </div>
  );
}
