use std::time::{SystemTime, UNIX_EPOCH};

use hidenseek_core::api::TunnelConfig;
use hidenseek_core::client::{self, Platform};
use hidenseek_core::tunnel::TunnelStats;
use hidenseek_core::{Error, Result};
use reqwest::Method;
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::{tunnel, AppState};

pub struct Connection {
    pub tunnel: TunnelConfig,
    pub since: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppView {
    api_url: Option<String>,
    portal_url: Option<String>,
    signed_in: bool,
    device_id: Option<String>,
    last_node_id: Option<String>,
    platform: Platform,
}

#[tauri::command]
pub fn app_state(state: State<'_, AppState>) -> AppView {
    let s = state.store.get();
    AppView {
        api_url: s.api_url,
        portal_url: s.portal.map(|p| p.portal_url),
        signed_in: s.tokens.is_some(),
        device_id: s.device.map(|d| d.id),
        last_node_id: s.last_node_id,
        platform: Platform::current(),
    }
}

#[tauri::command]
pub async fn set_server(state: State<'_, AppState>, url: String) -> Result<()> {
    client::set_server(&state.api, &state.store, &url).await
}

#[tauri::command]
pub async fn sign_in(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    client::sign_in(&state.api, &state.store, |url| {
        app.opener().open_url(url, None::<&str>).map_err(|e| Error::Auth(format!("could not open the browser: {e}")))
    })
    .await
}

#[tauri::command]
pub async fn sign_out(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    let _ = disconnect(app, state.clone()).await;
    client::sign_out(&state.store)
}

/// Authenticated passthrough for view data (`/api/...` only).
#[tauri::command]
pub async fn api(state: State<'_, AppState>, method: String, path: String, body: Option<Value>) -> Result<Value> {
    let method = Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| Error::Config(format!("bad method {method}")))?;
    state.api.request(method, &path, body).await
}

#[tauri::command]
pub async fn connect(app: AppHandle, state: State<'_, AppState>, node_id: String) -> Result<TunnelConfig> {
    let prepared = client::prepare_tunnel(&state.api, &state.store, &node_id, &device_name()).await?;
    tunnel::up(&app, &prepared.config).await?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    *state.connection.lock().await = Some(Connection { tunnel: prepared.tunnel.clone(), since: now });
    Ok(prepared.tunnel)
}

#[tauri::command]
pub async fn disconnect(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    tunnel::down(&app).await?;
    *state.connection.lock().await = None;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusView {
    #[serde(flatten)]
    stats: TunnelStats,
    tunnel: Option<TunnelConfig>,
    since: Option<u64>,
}

#[tauri::command]
pub async fn tunnel_status(app: AppHandle, state: State<'_, AppState>) -> Result<StatusView> {
    let stats = tunnel::stats(&app).await?;
    let connection = state.connection.lock().await;
    let (tunnel, since) = match (&*connection, stats.up) {
        (Some(c), true) => (Some(c.tunnel.clone()), Some(c.since)),
        _ => (None, None),
    };
    Ok(StatusView { stats, tunnel, since })
}

fn device_name() -> String {
    if cfg!(target_os = "android") {
        return "Android device".into();
    }
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .or_else(|| std::fs::read_to_string("/etc/hostname").ok().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "My computer".into())
}
