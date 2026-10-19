import { ExternalLink, KeyRound } from "lucide-react";
import { Button, ErrorNote } from "../components/ui";
import { useAction } from "../lib/hooks";
import { ipc } from "../lib/ipc";
import type { AppView } from "../lib/types";
import { AuthLayout } from "./AuthLayout";

export function SignIn({ app, onDone, onChangeServer }: { app: AppView; onDone: () => void; onChangeServer: () => void }) {
  const { pending, error, run } = useAction();

  const signIn = async () => {
    const ok = await run(async () => {
      await ipc.signIn();
      return true;
    });
    if (ok) onDone();
  };

  const host = (url: string | null) => (url ? new URL(url).host : "");

  return (
    <AuthLayout>
      <div className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-ink-400">
            Use your Portal account to sign in or create one. Your browser will open to <span className="text-ink-100">{host(app.portalUrl)}</span>.
          </p>
        </div>
        <Button variant="primary" size="lg" className="w-full" onClick={signIn} loading={pending} icon={!pending && <KeyRound className="size-4" />}>
          {pending ? "Waiting for your browser…" : "Continue with Portal SSO"}
        </Button>
        {pending && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-ink-400">
            <ExternalLink className="size-3.5" /> Finish signing in in the browser tab, then come back here.
          </p>
        )}
        <ErrorNote error={error} />
        <div className="flex items-center justify-between border-t border-white/5 pt-4 text-xs text-ink-400">
          <span className="truncate">Server: {host(app.apiUrl)}</span>
          <button onClick={onChangeServer} className="font-semibold text-ink-300 hover:text-ink-100">
            Change
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
