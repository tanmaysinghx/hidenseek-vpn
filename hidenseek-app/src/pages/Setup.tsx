import { ArrowRight, Server } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ErrorNote, Spinner, TextInput } from "../components/ui";
import { useAction } from "../lib/hooks";
import { ipc } from "../lib/ipc";
import { AuthLayout } from "./AuthLayout";

const DEFAULT_SERVER = import.meta.env.VITE_DEFAULT_SERVER ?? "";

export function Setup({ onDone, auto = true }: { onDone: () => void; auto?: boolean }) {
  const [url, setUrl] = useState(DEFAULT_SERVER);
  const { pending, error, run } = useAction();
  // Builds with a server baked in skip this screen: connect to it and go straight to sign-in.
  const [autoConnecting, setAutoConnecting] = useState(auto && Boolean(DEFAULT_SERVER));
  const tried = useRef(false);

  useEffect(() => {
    if (!autoConnecting || tried.current) return;
    tried.current = true;
    void run(async () => {
      await ipc.setServer(DEFAULT_SERVER);
      return true;
    }).then((ok) => (ok ? onDone() : setAutoConnecting(false)));
  }, [autoConnecting, onDone, run]);

  if (autoConnecting) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center gap-3 py-6 text-sm text-ink-300">
          <Spinner /> Connecting to {DEFAULT_SERVER.replace(/^https?:\/\//, "")}…
        </div>
      </AuthLayout>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(async () => {
      await ipc.setServer(url);
      return true;
    });
    if (ok) onDone();
  };

  return (
    <AuthLayout>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
            <Server className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Connect to your server</h2>
            <p className="text-sm text-ink-400">Enter the address your admin gave you.</p>
          </div>
        </div>
        <TextInput
          label="Server address"
          placeholder="vpn.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          required
        />
        <ErrorNote error={error} />
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending} icon={!pending && <ArrowRight className="size-4" />}>
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
