use serde::{Deserialize, Serialize};
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{Manager, Runtime};

pub fn init<R: Runtime, C: serde::de::DeserializeOwned>(
    api: PluginApi<R, C>,
) -> Result<Tunnel<R>, tauri::plugin::mobile::PluginInvokeError> {
    Ok(Tunnel(api.register_android_plugin("com.hidenseek.tunnel", "TunnelPlugin")?))
}

pub struct Tunnel<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct UpArgs<'a> {
    config: &'a str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub up: bool,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub last_handshake: Option<u64>,
}

impl<R: Runtime> Tunnel<R> {
    /// Asks for VPN permission the first time, then brings the tunnel up from a wg-quick config.
    pub fn up(&self, config: &str) -> Result<(), tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin::<serde_json::Value>("up", UpArgs { config }).map(|_| ())
    }

    pub fn down(&self) -> Result<(), tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin::<serde_json::Value>("down", ()).map(|_| ())
    }

    pub fn status(&self) -> Result<Status, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin("status", ())
    }
}

pub trait TunnelExt<R: Runtime> {
    fn tunnel(&self) -> &Tunnel<R>;
}

impl<R: Runtime, T: Manager<R>> TunnelExt<R> for T {
    fn tunnel(&self) -> &Tunnel<R> {
        self.state::<Tunnel<R>>().inner()
    }
}
