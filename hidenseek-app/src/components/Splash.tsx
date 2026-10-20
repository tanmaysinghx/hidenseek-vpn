import { useEffect, useState } from "react";

export const SPLASH_MS = 4000;

/**
 * Launch screen: the shield outline draws itself, fills with the brand gradient, radar rings
 * pulse out, and a bar fills over SPLASH_MS while the app loads behind it.
 */
export function Splash({ leaving }: { leaving: boolean }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = [setTimeout(() => setPhase(1), 900), setTimeout(() => setPhase(2), 1500)];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center overflow-hidden bg-ink-950 transition-opacity duration-500 ${leaving ? "pointer-events-none opacity-0" : "opacity-100"}`}
      role="status"
      aria-label="Starting Hidenseek VPN"
    >
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="absolute -bottom-40 -right-24 h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-3xl animate-float" />

      <div className="relative flex flex-col items-center">
        <div className="relative grid size-44 place-items-center">
          {phase >= 1 && [0, 0.8, 1.6].map((delay) => (
            <span
              key={delay}
              className="absolute inset-6 rounded-full border border-brand-400/40 animate-pulse-ring"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
          <svg viewBox="0 0 64 64" className="relative size-28 drop-shadow-[0_18px_40px_rgba(16,185,129,0.45)]" aria-hidden="true">
            <defs>
              <linearGradient id="splash-g" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
                <stop stopColor="#34d399" />
                <stop offset="1" stopColor="#0ea5e9" />
              </linearGradient>
            </defs>
            <path
              d="M32 4 9 13v17c0 14.6 9.8 26.4 23 30 13.2-3.6 23-15.4 23-30V13L32 4Z"
              fill="url(#splash-g)"
              stroke="url(#splash-g)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: phase >= 1 ? 0 : 1,
                fillOpacity: phase >= 1 ? 1 : 0,
                transition: "stroke-dashoffset 900ms ease-out, fill-opacity 600ms ease-out 500ms",
              }}
            />
            <g style={{ opacity: phase >= 2 ? 1 : 0, transform: `scale(${phase >= 2 ? 1 : 0.6})`, transformOrigin: "32px 33px", transition: "all 500ms cubic-bezier(.2,.8,.2,1)" }}>
              <path d="M20 33c3.6-4.4 7.6-6.6 12-6.6S40.4 28.6 44 33c-3.6 4.4-7.6 6.6-12 6.6S23.6 37.4 20 33Z" fill="#0b1220" />
              <circle cx="32" cy="33" r="3.6" fill="url(#splash-g)" />
            </g>
          </svg>
        </div>

        <h1
          className="mt-6 text-3xl font-bold tracking-tight transition-all duration-700"
          style={{ opacity: phase >= 1 ? 1 : 0, letterSpacing: phase >= 1 ? "-0.02em" : "0.3em" }}
        >
          Hidenseek
        </h1>
        <p className="mt-1 text-sm text-ink-400 transition-opacity delay-300 duration-700" style={{ opacity: phase >= 2 ? 1 : 0 }}>
          Private by design
        </p>

        <div className="mt-10 h-1 w-44 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-sky-400"
            style={{ animation: `splash-progress ${SPLASH_MS}ms cubic-bezier(.4,0,.2,1) forwards` }}
          />
        </div>
      </div>
      <style>{"@keyframes splash-progress{from{width:0}to{width:100%}}"}</style>
    </div>
  );
}
