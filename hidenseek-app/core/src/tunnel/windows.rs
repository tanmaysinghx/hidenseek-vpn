//! Windows: the official WireGuard for Windows tunnel service. The app is built with a
//! requireAdministrator manifest, so installing the service needs no extra prompt. The service
//! enables WireGuard's built-in kill switch for full-tunnel configs.

use std::path::{Path, PathBuf};

use tokio::process::Command;

use super::TunnelStats;
use crate::store::write_private;
use crate::wgconf::INTERFACE;
use crate::{Error, Result};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn wireguard_dir() -> PathBuf {
    let base = std::env::var_os("ProgramFiles").map(PathBuf::from).unwrap_or_else(|| r"C:\Program Files".into());
    base.join("WireGuard")
}

async fn run(exe: &str, args: &[&str]) -> Result<String> {
    let path = wireguard_dir().join(exe);
    if !path.exists() {
        return Err(Error::Tunnel(
            "WireGuard for Windows is not installed. Get it from https://www.wireguard.com/install/ and try again."
                .into(),
        ));
    }
    let output = Command::new(path).args(args).creation_flags(CREATE_NO_WINDOW).output().await?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(Error::Tunnel(if stderr.is_empty() { format!("{exe} failed") } else { stderr }));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub async fn up(dir: &Path, config: &str) -> Result<()> {
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
