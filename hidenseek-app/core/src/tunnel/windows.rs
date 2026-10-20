//! Windows: the official WireGuard for Windows tunnel service. The app is built with a
//! requireAdministrator manifest, so installing the service needs no extra prompt. The service
//! enables WireGuard's built-in kill switch for full-tunnel configs.
//!
//! The installer bundles WireGuard's signed MSI. If WireGuard is missing (first run, or the user
//! removed it), it is installed silently before connecting, so users never install it themselves.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tokio::process::Command;

use super::TunnelStats;
use crate::store::write_private;
use crate::wgconf::INTERFACE;
use crate::{Error, Result};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

static BUNDLED_MSI: OnceLock<PathBuf> = OnceLock::new();

/// Where the bundled `wireguard-amd64.msi` lives (the app's resource directory).
pub fn set_bundled_installer(msi: PathBuf) {
    let _ = BUNDLED_MSI.set(msi);
}

fn wireguard_dir() -> PathBuf {
    let base = std::env::var_os("ProgramFiles").map(PathBuf::from).unwrap_or_else(|| r"C:\Program Files".into());
    base.join("WireGuard")
}

/// Strips the `\\?\` verbatim prefix Tauri's resource dir can carry: Rust's file APIs accept it, but
/// msiexec can't open such a path and fails with 1619 (ERROR_INSTALL_PACKAGE_OPEN_FAILED).
fn plain_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    if let Some(unc) = s.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{unc}")
    } else if let Some(local) = s.strip_prefix(r"\\?\") {
        local.to_string()
    } else {
        s.into_owned()
    }
}

/// Installs the bundled WireGuard MSI quietly if WireGuard isn't present. msiexec's verbose log is
/// written to `dir` so a failed install can be diagnosed.
async fn ensure_wireguard(dir: &Path) -> Result<()> {
    if wireguard_dir().join("wireguard.exe").exists() {
        return Ok(());
    }
    let msi = BUNDLED_MSI.get().filter(|p| p.exists()).ok_or_else(|| {
        Error::Tunnel("WireGuard is missing and this build has no bundled installer. Reinstall Hidenseek VPN.".into())
    })?;
    let log = dir.join("wireguard-install.log");
    // DO_NOT_LAUNCH keeps WireGuard's own window from opening; the app manages tunnels itself.
    let status = Command::new("msiexec")
        .args(["/i", &plain_path(msi), "/qn", "/norestart", "DO_NOT_LAUNCH=1", "/l*v", &plain_path(&log)])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .await?;
    if !status.success() || !wireguard_dir().join("wireguard.exe").exists() {
        return Err(Error::Tunnel(format!(
            "Installing the WireGuard engine failed ({status}). Details: {}",
            plain_path(&log)
        )));
    }
    Ok(())
}

async fn run(exe: &str, args: &[&str]) -> Result<String> {
    let path = wireguard_dir().join(exe);
    if !path.exists() {
        return Err(Error::Tunnel("The WireGuard engine is not installed".into()));
    }
    let output = Command::new(path).args(args).creation_flags(CREATE_NO_WINDOW).output().await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(Error::Tunnel(if stderr.is_empty() { format!("{exe} failed") } else { stderr }));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub async fn up(dir: &Path, config: &str) -> Result<()> {
    ensure_wireguard(dir).await?;
    if stats().await?.up {
        down(dir).await?;
    }
    let path = dir.join(format!("{INTERFACE}.conf"));
    write_private(&path, config.as_bytes())?;
    let result = run("wireguard.exe", &["/installtunnelservice", &path.to_string_lossy()]).await;
    // The service keeps its own encrypted copy; don't leave the private key lying around.
    let _ = std::fs::remove_file(&path);
    result.map(|_| ())
}

pub async fn down(_dir: &Path) -> Result<()> {
    if !stats().await?.up {
        return Ok(());
    }
    run("wireguard.exe", &["/uninstalltunnelservice", INTERFACE]).await.map(|_| ())
}

/// `wg show <iface> dump`: the second line is the peer, with handshake, rx and tx in columns 5-7.
pub async fn stats() -> Result<TunnelStats> {
    let Ok(dump) = run("wg.exe", &["show", INTERFACE, "dump"]).await else {
        return Ok(TunnelStats::default());
    };
    let Some(peer) = dump.lines().nth(1) else {
        return Ok(TunnelStats { up: true, ..Default::default() });
    };
    let cols: Vec<&str> = peer.split('\t').collect();
    let num = |i: usize| cols.get(i).and_then(|v| v.parse::<u64>().ok()).unwrap_or(0);
    let handshake = num(4);
    Ok(TunnelStats {
        up: true,
        rx_bytes: num(5),
        tx_bytes: num(6),
        last_handshake: (handshake > 0).then_some(handshake),
    })
}
