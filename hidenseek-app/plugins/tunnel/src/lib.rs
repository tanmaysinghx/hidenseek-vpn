//! On Android, the tunnel runs in WireGuard's `GoBackend` VpnService (see `android/`). Elsewhere
//! this plugin is a no-op; desktop apps use the system WireGuard install instead.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

#[cfg(target_os = "android")]
mod mobile;
#[cfg(target_os = "android")]
pub use mobile::{Status, Tunnel, TunnelExt};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("hidenseek-tunnel")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                _app.manage(mobile::init(_api)?);
            }
            Ok(())
        })
        .build()
}
