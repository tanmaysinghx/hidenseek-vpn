import { useCallback, useEffect, useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { Spinner } from "./components/ui";
import { ipc, api } from "./lib/ipc";
import type { AppView, User } from "./lib/types";
import { Setup } from "./pages/Setup";
import { SignIn } from "./pages/SignIn";
import { Pending } from "./pages/Pending";
import { Home } from "./pages/Home";
import { HistoryPage } from "./pages/History";
import { Devices } from "./pages/Devices";
import { SettingsPage } from "./pages/Settings";
import { Admin } from "./pages/admin/Admin";

export default function App() {
  const [app, setApp] = useState<AppView | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>("home");
  const [connected, setConnected] = useState(false);
  // Set when the user chose "Use a different server", so the baked-in server isn't reapplied.
  const [manualServer, setManualServer] = useState(false);

  const refresh = useCallback(async () => {
    const view = await ipc.appState();
    setApp(view);
    if (view.signedIn) {
      try {
        setMe(await api.get<User>("/api/v1/me"));
      } catch {
        setMe(null);
        setApp(await ipc.appState());
      }
    } else {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onSignedOut = () => void refresh();
    window.addEventListener("hidenseek:signed-out", onSignedOut);
    return () => window.removeEventListener("hidenseek:signed-out", onSignedOut);
  }, [refresh]);

  if (!app || (app.signedIn && !me)) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-7" />
      </div>
    );
  }
  const changeServer = () => {
    setManualServer(true);
    setApp({ ...app, apiUrl: null });
  };
  if (!app.apiUrl) return <Setup onDone={refresh} auto={!manualServer} />;
  if (!app.signedIn || !me) return <SignIn app={app} onDone={refresh} onChangeServer={changeServer} />;
  if (me.status !== "APPROVED") return <Pending me={me} onRefresh={refresh} />;

  const isAdmin = me.role === "ADMIN";
  return (
    <Shell route={route} onNavigate={setRoute} isAdmin={isAdmin} connected={connected}>
      {route === "home" && <Home app={app} onConnectedChange={setConnected} />}
      {route === "history" && <HistoryPage />}
      {route === "devices" && <Devices currentDeviceId={app.deviceId} />}
      {route === "admin" && isAdmin && <Admin me={me} />}
      {route === "settings" && <SettingsPage app={app} me={me} onSignedOut={refresh} onChangeServer={changeServer} />}
    </Shell>
  );
}
