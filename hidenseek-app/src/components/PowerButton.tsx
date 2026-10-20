import { Power } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";

export type Phase = "off" | "connecting" | "on" | "disconnecting";

export function PowerButton({ phase, onClick, disabled }: { phase: Phase; onClick: () => void; disabled?: boolean }) {
  const on = phase === "on";
  const busy = phase === "connecting" || phase === "disconnecting";

  // A one-off burst each time the tunnel comes up.
  const [bursts, setBursts] = useState(0);
  const wasOn = useRef(on);
  useEffect(() => {
    if (on && !wasOn.current) setBursts((n) => n + 1);
    wasOn.current = on;
  }, [on]);

  return (
    <div className="relative grid size-56 place-items-center sm:size-64">
      {on && (
        <>
          <span className="absolute inset-8 rounded-full bg-brand-400/25 animate-pulse-ring" />
          <span className="absolute inset-8 rounded-full bg-brand-400/15 animate-pulse-ring" style={{ animationDelay: "1.2s" }} />
        </>
      )}
      {bursts > 0 && <span key={bursts} className="absolute inset-8 rounded-full border-2 border-brand-300/70 animate-burst" />}

      {busy && (
        <div className="absolute inset-3 animate-orbit" aria-hidden="true">
          {[0, 120, 240].map((deg) => (
            <span key={deg} className="absolute inset-0" style={{ transform: `rotate(${deg}deg)` }}>
              <span className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300 shadow-[0_0_12px] shadow-sky-300" />
            </span>
          ))}
        </div>
      )}
      {busy && <span className="absolute inset-3 rounded-full border border-dashed border-sky-400/25" />}

      <div
        className={cx(
          "absolute inset-8 rounded-full blur-2xl transition-all duration-700",
          on ? "bg-brand-500/35 opacity-100" : busy ? "bg-sky-500/20 opacity-100" : "bg-white/5 opacity-60",
        )}
      />
      <button
        onClick={onClick}
        disabled={disabled || busy}
        aria-label={on ? "Disconnect" : "Connect"}
        className={cx(
          "relative grid size-40 place-items-center rounded-full border transition-all duration-500 sm:size-44",
          "enabled:hover:scale-[1.03] enabled:active:scale-95 disabled:cursor-not-allowed",
          on
            ? "border-brand-300/40 bg-gradient-to-b from-brand-400 to-brand-500 text-ink-950 shadow-[0_24px_70px_-18px] shadow-brand-500/80"
            : busy
              ? "border-sky-400/30 bg-ink-800 text-sky-300"
              : "border-white/10 bg-gradient-to-b from-ink-700 to-ink-800 text-ink-300 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)] hover:border-brand-400/40 hover:text-brand-300",
        )}
      >
        <Power className={cx("size-14 transition-transform duration-500", busy && "animate-pulse", on && "scale-110")} strokeWidth={2.2} />
      </button>
    </div>
  );
}
