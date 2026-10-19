//! Linux: `wg-quick` (from wireguard-tools) run through polkit's `pkexec`, so the app itself never
//! needs root. Stats come from sysfs, which any user can read.

use std::path::{Path, PathBuf};

use tokio::process::Command;

use super::TunnelStats;
use crate::store::write_private;
use crate::wgconf::INTERFACE;
use crate::{Error, Result};

fn config_path(dir: &Path) -> PathBuf {
    // wg-quick names the interface after the file.
    dir.join(format!("{INTERFACE}.conf"))
}

fn sysfs() -> PathBuf {
    PathBuf::from("/sys/class/net").join(INTERFACE)
}

pub async fn up(dir: &Path, config: &str) -> Result<()> {
    if which("wg-quick").is_none() {
        return Err(Error::Tunnel(
            "WireGuard tools are not installed. Install the `wireguard-tools` package and try again.".into(),
        ));
    }
    let path = config_path(dir);
    write_private(&path, config.as_bytes())?;
    if sysfs().exists() {
        // Switching servers: replace the running tunnel in one privileged call.
        let script = format!("wg-quick down {0} ; wg-quick up {0}", shell_quote(&path));
        return privileged(&["sh", "-c", &script]).await;
    }
    privileged(&["wg-quick", "up", &path.to_string_lossy()]).await
}

pub async fn down(dir: &Path) -> Result<()> {
    if !sysfs().exists() {
        return Ok(());
    }
    let path = config_path(dir);
    let target = if path.exists() { path.to_string_lossy().into_owned() } else { INTERFACE.to_string() };
    privileged(&["wg-quick", "down", &target]).await
}

pub async fn stats() -> Result<TunnelStats> {
    let dir = sysfs();
    if !dir.exists() {
        return Ok(TunnelStats::default());
    }
    let read = |name: &str| -> u64 {
        std::fs::read_to_string(dir.join("statistics").join(name))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0)
    };
    Ok(TunnelStats { up: true, rx_bytes: read("rx_bytes"), tx_bytes: read("tx_bytes"), last_handshake: None })
}

async fn privileged(args: &[&str]) -> Result<()> {
    let output = Command::new("pkexec").args(args).output().await.map_err(|e| {
        Error::Tunnel(format!("could not run pkexec ({e}). Install polkit, or run: sudo wg-quick up <config>"))
    })?;
    match output.status.code() {
        Some(0) => Ok(()),
        Some(126) => Err(Error::Tunnel("Permission was denied".into())),
        _ => Err(Error::Tunnel(String::from_utf8_lossy(&output.stderr).trim().to_string())),
    }
}

fn which(binary: &str) -> Option<PathBuf> {
    std::env::var_os("PATH")
        .into_iter()
        .flat_map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .chain(["/usr/bin", "/usr/sbin", "/bin", "/sbin"].map(PathBuf::from))
        .map(|dir| dir.join(binary))
        .find(|p| p.is_file())
}

fn shell_quote(path: &Path) -> String {
    format!("'{}'", path.to_string_lossy().replace('\'', r"'\''"))
}
