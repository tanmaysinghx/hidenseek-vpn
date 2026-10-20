import { Eye, EyeOff, ExternalLink, LogIn, MailCheck, UserPlus } from "lucide-react";
import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { Button, ErrorNote, cx } from "../components/ui";
import { useAction } from "../lib/hooks";
import { ipc } from "../lib/ipc";
import type { AppView } from "../lib/types";
import { AuthLayout } from "./AuthLayout";

type Mode = "signIn" | "register";

export function SignIn({ app, onDone, onChangeServer }: { app: AppView; onDone: () => void; onChangeServer: () => void }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const browser = useAction();
  const host = (url: string | null) => (url ? new URL(url).host : "");

  const viaBrowser = async () => {
    const ok = await browser.run(async () => {
      await ipc.signIn();
      return true;
    });
    if (ok) onDone();
  };

  return (
    <AuthLayout>
      {app.passwordLogin ? (
        <>
          <div className="relative mb-6 grid grid-cols-2 rounded-xl bg-ink-950/70 p-1 ring-1 ring-white/5" role="tablist">
            <span
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-ink-700 shadow transition-transform duration-300 ease-out"
              style={{ transform: mode === "register" ? "translateX(100%)" : "none" }}
              aria-hidden="true"
            />
            {(["signIn", "register"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cx("relative h-9 rounded-lg text-sm font-semibold transition-colors", mode === m ? "text-ink-100" : "text-ink-400 hover:text-ink-100")}
              >
                {m === "signIn" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          {pendingNotice ? (
            <div className="space-y-4 text-center animate-rise">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-400"><MailCheck className="size-6" /></div>
              <p className="text-sm text-ink-300">{pendingNotice}</p>
              <Button className="w-full" onClick={() => { setPendingNotice(null); setMode("signIn"); }}>Back to sign in</Button>
            </div>
          ) : mode === "signIn" ? (
            <SignInForm key="in" onDone={onDone} />
          ) : (
            <RegisterForm key="up" onDone={onDone} onPending={setPendingNotice} />
          )}
        </>
      ) : app.browserLogin ? (
        <p className="mb-5 text-sm text-ink-400">Sign in with your Portal account. Your browser will open to {host(app.portalUrl)}.</p>
      ) : (
        <p className="text-sm text-ink-400">This server doesn't offer sign-in from this device yet. Ask its admin to turn on email sign-in, or use a different server.</p>
      )}

      {app.browserLogin && (
        <div className={app.passwordLogin ? "mt-5 border-t border-white/5 pt-5" : ""}>
          <Button
            variant={app.passwordLogin ? "ghost" : "primary"}
            size={app.passwordLogin ? "md" : "lg"}
            className="w-full"
            onClick={viaBrowser}
            loading={browser.pending}
            icon={!browser.pending && <ExternalLink className="size-4" />}
          >
            {browser.pending ? "Waiting for your browser…" : "Continue in browser"}
          </Button>
          <ErrorNote error={browser.error} className="mt-3" />
        </div>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4 text-xs text-ink-400">
        <span className="truncate">Server: {host(app.apiUrl)}</span>
        <button onClick={onChangeServer} className="font-semibold text-ink-300 hover:text-ink-100">Change</button>
      </div>
    </AuthLayout>
  );
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-300">{label}</span>
      <input
        className="h-11 w-full rounded-xl border border-white/10 bg-ink-950/60 px-3.5 text-sm text-ink-100 outline-none transition placeholder:text-ink-400 focus:border-brand-400/60 focus:ring-4 focus:ring-brand-400/10"
        {...props}
      />
    </label>
  );
}

function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [shown, setShown] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-300">{label}</span>
      <div className="flex h-11 items-center rounded-xl border border-white/10 bg-ink-950/60 pr-1 transition focus-within:border-brand-400/60 focus-within:ring-4 focus-within:ring-brand-400/10">
        <input
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 text-sm text-ink-100 outline-none"
        />
        <button type="button" onClick={() => setShown(!shown)} className="grid size-9 place-items-center rounded-lg text-ink-400 hover:text-ink-100" aria-label={shown ? "Hide password" : "Show password"}>
          {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </label>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { pending, error, run } = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(async () => { await ipc.signInPassword(email, password); return true; })) onDone();
  };
  return (
    <form onSubmit={submit} className="space-y-4 animate-rise">
      <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
      <ErrorNote error={error} />
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} icon={!pending && <LogIn className="size-4" />}>
        Sign in
      </Button>
      <p className="text-center text-xs text-ink-400">You stay signed in on this device for 30 days.</p>
    </form>
  );
}

function strength(p: string): { score: number; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
  return { score, label: ["Too short", "Weak", "Okay", "Good", "Strong"][score] };
}

function RegisterForm({ onDone, onPending }: { onDone: () => void; onPending: (message: string) => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const { pending, error, run } = useAction();
  const s = strength(form.password);
  const set = (key: keyof typeof form) => (v: string) => setForm({ ...form, [key]: v });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const outcome = await run(() => ipc.register(form));
    if (!outcome) return;
    if (outcome.outcome === "signedIn") onDone();
    else onPending(outcome.message);
  };
  return (
    <form onSubmit={submit} className="space-y-4 animate-rise">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName")(e.target.value)} required autoFocus />
        <Field label="Last name" autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName")(e.target.value)} />
      </div>
      <Field label="Email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set("email")(e.target.value)} required />
      <div>
        <PasswordField label="Password" value={form.password} onChange={set("password")} autoComplete="new-password" />
        {form.password && (
          <div className="mt-2 flex items-center gap-2" aria-live="polite">
            <div className="flex flex-1 gap-1">
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className={cx("h-1 flex-1 rounded-full transition-colors duration-300", i <= s.score ? (s.score >= 3 ? "bg-brand-400" : "bg-amber-400") : "bg-white/10")} />
              ))}
            </div>
            <span className="w-16 text-right text-[11px] text-ink-400">{s.label}</span>
          </div>
        )}
      </div>
      <ErrorNote error={error} />
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} disabled={form.password.length < 8} icon={!pending && <UserPlus className="size-4" />}>
        Create account
      </Button>
      <p className="text-center text-xs text-ink-400">Your account is shared with Portal. An admin approves new people before they can connect.</p>
    </form>
  );
}
