import { useCallback, useEffect, useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { SPLASH_MS, Splash } from "./components/Splash";
import { ipc, api } from "./lib/ipc";
import type { AppView, User } from "./lib/types";
import { Setup } from "./pages/Setup";
import { SignIn } from "./pages/SignIn";
import { Pending } from "./pages/Pending";
import { Home } from "./pages/Home";
import { HistoryPage } from "./pages/History";
import { Devices } from "./pages/Devices";
import { PlanPage } from "./pages/PlanPage";
import { SettingsPage } from "./pages/Settings";
import { Admin } from "./pages/admin/Admin";

export default function App() {
  const [app, setApp] = useState<AppView | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [route, setRoute] = useState<Route>("home");
  const [connected, setConnected] = useState(false);
  // Set when the user chose "Use a different server", so the baked-in server isn't reapplied.
  const [manualServer, setManualServer] = useState(false);
  // The splash stays up for SPLASH_MS on every launch, then fades out over the loaded screen.
  const [splash, setSplash] = useState<"showing" | "leaving" | "gone">("showing");

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

  useEffect(() => {
    const leave = setTimeout(() => setSplash("leaving"), SPLASH_MS);
    const gone = setTimeout(() => setSplash("gone"), SPLASH_MS + 500);
    return () => {
      clearTimeout(leave);
      clearTimeout(gone);
    };
  }, []);

  const loading = !app || (app.signedIn && !me);
  // Stays up past SPLASH_MS if loading is slow, so there's never a blank screen.
  const splashScreen = (splash !== "gone" || loading) && <Splash leaving={splash !== "showing" && !loading} />;
  if (loading || splash === "showing") return <>{splashScreen}</>;

  const changeServer = () => {
    setManualServer(true);
    setApp({ ...app, apiUrl: null });
  };

  let screen;
  if (!app.apiUrl) {
    screen = <Setup onDone={refresh} auto={!manualServer} />;
  } else if (!app.signedIn || !me) {
    screen = <SignIn app={app} onDone={refresh} onChangeServer={changeServer} />;
  } else if (me.status !== "APPROVED") {
    screen = <Pending me={me} onRefresh={refresh} />;
  } else {
    const isAdmin = me.role === "ADMIN";
    screen = (
      <Shell route={route} onNavigate={setRoute} isAdmin={isAdmin} connected={connected}>
        <div key={route} className="h-full animate-rise">
          {route === "home" && <Home app={app} onConnectedChange={setConnected} onOpenPlan={() => setRoute("plan")} />}
          {route === "history" && <HistoryPage />}
          {route === "devices" && <Devices currentDeviceId={app.deviceId} />}
          {route === "plan" && <PlanPage />}
          {route === "admin" && isAdmin && <Admin me={me} />}
          {route === "settings" && <SettingsPage app={app} me={me} onSignedOut={refresh} onChangeServer={changeServer} />}
        </div>
      </Shell>
    );
  }

  return (
    <>
      {splashScreen}
      <div className="h-full">{screen}</div>
    </>
  );
}
