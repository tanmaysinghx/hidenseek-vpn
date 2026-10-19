import { Ban, Hourglass, RefreshCw } from "lucide-react";
import { Button } from "../components/ui";
import { useAction } from "../lib/hooks";
import { ipc } from "../lib/ipc";
import type { User } from "../lib/types";
import { AuthLayout } from "./AuthLayout";

export function Pending({ me, onRefresh }: { me: User; onRefresh: () => Promise<void> }) {
  const { pending, run } = useAction();
  const suspended = me.status === "SUSPENDED";
  return (
    <AuthLayout>
      <div className="space-y-5 text-center">
        <div className={`mx-auto grid size-12 place-items-center rounded-2xl ${suspended ? "bg-rose-500/10 text-rose-400" : "bg-amber-500/10 text-amber-300"}`}>
          {suspended ? <Ban className="size-6" /> : <Hourglass className="size-6" />}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{suspended ? "Access suspended" : "Waiting for approval"}</h2>
          <p className="mt-1 text-sm text-ink-400">
            {suspended
              ? "An admin has suspended VPN access for this account."
              : "You're signed in. An admin needs to approve your account before you can connect."}
          </p>
          <p className="mt-3 text-sm font-medium">{me.email}</p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => run(onRefresh)} loading={pending} icon={<RefreshCw className="size-4" />}>
            Check again
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => run(async () => { await ipc.signOut(); await onRefresh(); })}>
            Sign out
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
