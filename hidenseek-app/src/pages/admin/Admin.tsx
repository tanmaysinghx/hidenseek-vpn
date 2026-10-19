import { useState } from "react";
import { PageHeader, cx } from "../../components/ui";
import type { User } from "../../lib/types";
import { Overview } from "./Overview";
import { Users } from "./Users";
import { Servers } from "./Servers";
import { Sessions } from "./Sessions";
import { Activity } from "./Activity";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "servers", label: "Servers" },
  { id: "users", label: "Users" },
  { id: "sessions", label: "Sessions" },
  { id: "activity", label: "Activity" },
] as const;

type Tab = (typeof tabs)[number]["id"];

export function Admin({ me }: { me: User }) {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <>
      <PageHeader title="Admin" subtitle="Manage servers, people and connection data." />
      <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-xl bg-ink-950/60 p-1 ring-1 ring-white/5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "h-8 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors",
                tab === t.id ? "bg-ink-700 text-ink-100 shadow" : "text-ink-400 hover:text-ink-100",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="animate-fade-in" key={tab}>
        {tab === "overview" && <Overview onNavigate={setTab} />}
        {tab === "servers" && <Servers />}
        {tab === "users" && <Users me={me} />}
        {tab === "sessions" && <Sessions />}
        {tab === "activity" && <Activity />}
      </div>
    </>
  );
}
