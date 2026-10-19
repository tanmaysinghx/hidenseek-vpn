//! Desktop tunnel control: the kernel's WireGuard driven directly on Linux, the official WireGuard
//! tunnel service on Windows. Android uses the VpnService plugin in `plugins/tunnel` instead.

use serde::Serialize;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::{down, helper_main, stats, up, HELPER_ARG};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::{down, set_bundled_installer, stats, up};

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
mod unsupported;
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub use unsupported::{down, stats, up};

/// Counters from the client's side: rx is downloaded, tx uploaded.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStats {
    pub up: bool,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    /// Unix seconds, when the platform can report it.
    pub last_handshake: Option<u64>,
}
