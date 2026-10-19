//! The app's use cases, shared by every platform: set up, sign in, get a tunnel config.

use serde::Serialize;
use serde_json::json;

use crate::api::{Api, DeviceView, TunnelConfig};
use crate::oidc;
use crate::store::{DeviceIdentity, Store};
use crate::{keys, wgconf, Error, Result};

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Platform {
    Windows,
    Linux,
    Android,
    Macos,
    Other,
}

impl Platform {
    pub fn current() -> Self {
        if cfg!(target_os = "android") {
            Platform::Android
        } else if cfg!(target_os = "windows") {
            Platform::Windows
        } else if cfg!(target_os = "linux") {
            Platform::Linux
        } else if cfg!(target_os = "macos") {
            Platform::Macos
        } else {
            Platform::Other
        }
    }
}

/// Points the app at a backend and remembers which Portal it signs in with.
pub async fn set_server(api: &Api, store: &Store, api_url: &str) -> Result<()> {
    let api_url = normalize_url(api_url)?;
    let portal = api.discover(&api_url).await?;
    store.update(|s| {
        if s.api_url.as_deref() != Some(api_url.as_str()) {
            // A different server means a different identity and device registration.
            s.tokens = None;
            s.device = None;
            s.last_node_id = None;
        }
        s.api_url = Some(api_url);
        s.portal = Some(portal);
    })?;
    Ok(())
}

pub async fn sign_in(api: &Api, store: &Store, open_browser: impl FnOnce(&str) -> Result<()>) -> Result<()> {
    let state = store.get();
    let (Some(portal), Some(api_url)) = (state.portal, state.api_url) else {
        return Err(Error::Config("choose a server first".into()));
    };
    let tokens = oidc::login(api.http(), &portal, oidc::endpoint_for(&portal, &api_url), open_browser).await?;
    store.update(|s| s.tokens = Some(tokens))?;
    Ok(())
}

pub fn sign_out(store: &Store) -> Result<()> {
    store.update(|s| s.tokens = None)?;
    Ok(())
}

/// A ready-to-use WireGuard config for `node_id`, registering this device first if needed.
pub struct PreparedTunnel {
    pub tunnel: TunnelConfig,
    pub config: String,
}

pub async fn prepare_tunnel(api: &Api, store: &Store, node_id: &str, device_name: &str) -> Result<PreparedTunnel> {
    let mut device = ensure_device(api, store, device_name).await?;
    let path = |id: &str| format!("/api/v1/devices/{id}/tunnel");
    let tunnel: TunnelConfig = match api.post(&path(&device.id), json!({ "nodeId": node_id })).await {
        Err(e) if e.is_not_found() && e.to_string().contains("Device") => {
            // The device was removed (from another device or by an admin); register again.
            store.update(|s| s.device = None)?;
            device = ensure_device(api, store, device_name).await?;
            api.post(&path(&device.id), json!({ "nodeId": node_id })).await?
        }
        other => other?,
    };
    store.update(|s| s.last_node_id = Some(node_id.to_string()))?;
    let config = wgconf::render(&tunnel, &device.private_key);
    Ok(PreparedTunnel { tunnel, config })
}

async fn ensure_device(api: &Api, store: &Store, device_name: &str) -> Result<DeviceIdentity> {
    if let Some(device) = store.get().device {
        return Ok(device);
    }
    let pair = keys::generate()?;
    let view: DeviceView = api
        .post(
            "/api/v1/devices",
            json!({ "name": device_name, "platform": Platform::current(), "publicKey": pair.public_key }),
        )
        .await?;
    let device = DeviceIdentity { id: view.id, private_key: pair.private_key, public_key: pair.public_key };
    store.update(|s| s.device = Some(device.clone()))?;
    Ok(device)
}

fn normalize_url(input: &str) -> Result<String> {
    let trimmed = input.trim().trim_end_matches('/');
    let with_scheme = if trimmed.contains("://") { trimmed.to_string() } else { format!("https://{trimmed}") };
    let url = url::Url::parse(&with_scheme).map_err(|_| Error::Config(format!("{input} is not a valid URL")))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "10.0.2.2"));
    if url.scheme() != "https" && !local {
        return Err(Error::Config("the server must use https://".into()));
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_server_urls() {
        assert_eq!(normalize_url("vpn.example.com/").unwrap(), "https://vpn.example.com");
        assert_eq!(normalize_url("http://localhost:8090").unwrap(), "http://localhost:8090");
        assert!(normalize_url("http://vpn.example.com").is_err());
    }
}
