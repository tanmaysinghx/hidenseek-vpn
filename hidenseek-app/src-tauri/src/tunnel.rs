//! Picks the tunnel driver: the VpnService plugin on Android, system WireGuard everywhere else.

use hidenseek_core::tunnel::TunnelStats;
use hidenseek_core::{Error, Result};
use tauri::{AppHandle, Runtime};

#[cfg(not(target_os = "android"))]
use tauri::Manager;

#[cfg(not(target_os = "android"))]
pub async fn up<R: Runtime>(app: &AppHandle<R>, config: &str) -> Result<()> {
    let dir = app.path().app_data_dir().map_err(|e| Error::Tunnel(e.to_string()))?;
    hidenseek_core::tunnel::up(&dir, config).await
}

#[cfg(not(target_os = "android"))]
pub async fn down<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let dir = app.path().app_data_dir().map_err(|e| Error::Tunnel(e.to_string()))?;
    hidenseek_core::tunnel::down(&dir).await
}

#[cfg(not(target_os = "android"))]
pub async fn stats<R: Runtime>(_app: &AppHandle<R>) -> Result<TunnelStats> {
    hidenseek_core::tunnel::stats().await
}

#[cfg(target_os = "android")]
use tauri_plugin_hidenseek_tunnel::TunnelExt;

#[cfg(target_os = "android")]
pub async fn up<R: Runtime>(app: &AppHandle<R>, config: &str) -> Result<()> {
    app.tunnel().up(config).map_err(|e| Error::Tunnel(e.to_string()))
}

#[cfg(target_os = "android")]
pub async fn down<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    app.tunnel().down().map_err(|e| Error::Tunnel(e.to_string()))
}

#[cfg(target_os = "android")]
pub async fn stats<R: Runtime>(app: &AppHandle<R>) -> Result<TunnelStats> {
    let s = app.tunnel().status().map_err(|e| Error::Tunnel(e.to_string()))?;
    Ok(TunnelStats { up: s.up, rx_bytes: s.rx_bytes, tx_bytes: s.tx_bytes, last_handshake: s.last_handshake })
}
