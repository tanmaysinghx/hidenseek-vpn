import type { ReactNode } from "react";

/** Centered card on a slowly drifting gradient, for the screens before sign-in. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-500/12 blur-3xl animate-float" />
      <div className="pointer-events-none absolute -bottom-52 right-0 h-[420px] w-[520px] rounded-full bg-sky-500/10 blur-3xl animate-float" style={{ animationDelay: "-4s" }} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div className="relative w-full max-w-md animate-rise">
        <div className="mb-7 flex flex-col items-center text-center">
          <img src="/logo.svg" alt="" className="mb-4 size-14 drop-shadow-[0_10px_30px_rgba(16,185,129,0.35)]" />
          <h1 className="text-2xl font-bold tracking-tight">Hidenseek VPN</h1>
          <p className="mt-1 text-sm text-ink-400">Private WireGuard tunnels on servers you trust.</p>
        </div>
        <div className="card p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] sm:p-7">{children}</div>
      </div>
    </div>
  );
}
