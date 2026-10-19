import { LogOut, Server, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, PageHeader } from "../components/ui";
import { useAction } from "../lib/hooks";
import { ipc } from "../lib/ipc";
import type { AppView, User } from "../lib/types";

export function SettingsPage({ app, me, onSignedOut, onChangeServer }: { app: AppView; me: User; onSignedOut: () => void; onChangeServer: () => void }) {
  const action = useAction();
  const signOut = async () => {
    await action.run(() => ipc.signOut());
    onSignedOut();
  };
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Section icon={<UserRound className="size-4" />} title="Account">
          <Row label="Email" value={me.email} />
          <Row label="Name" value={me.displayName ?? "—"} />
          <Row label="Role" value={<Badge tone={me.role === "ADMIN" ? "sky" : "gray"}>{me.role === "ADMIN" ? "Admin" : "Member"}</Badge>} />
          <div className="pt-2">
            <Button variant="danger" onClick={signOut} loading={action.pending} icon={<LogOut className="size-4" />}>
              Sign out
            </Button>
          </div>
        </Section>
        <Section icon={<Server className="size-4" />} title="Server">
          <Row label="Backend" value={<span className="font-mono text-xs">{app.apiUrl}</span>} />
          <Row label="Sign-in portal" value={<span className="font-mono text-xs">{app.portalUrl}</span>} />
          <Row label="Platform" value={app.platform} />
          <div className="pt-2">
            <Button onClick={onChangeServer}>Use a different server</Button>
          </div>
        </Section>
        <p className="px-1 text-xs text-ink-400">
          Hidenseek VPN 0.1.0 · open source ·{" "}
          <span className="text-ink-300">github.com/tanmaysinghx/hidenseek-vpn</span>
        </p>
      </div>
    </>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-300">
        {icon}
        {title}
      </h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-ink-400">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}
