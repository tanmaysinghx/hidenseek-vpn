//! Tauri shell: exposes hidenseek-core to the UI as commands. Tokens, keys and HTTP stay on this
//! side; the web UI only ever sees view data.

mod commands;
mod tunnel;

use std::sync::Arc;

use hidenseek_core::api::Api;
use hidenseek_core::store::Store;
use tauri::Manager;

pub struct AppState {
    pub store: Arc<Store>,
    pub api: Api,
    pub connection: tokio::sync::Mutex<Option<commands::Connection>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_hidenseek_tunnel::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = Arc::new(Store::open(dir)?);
            app.manage(AppState { api: Api::new(store.clone()), store, connection: Default::default() });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_state,
            commands::set_server,
            commands::sign_in,
            commands::sign_out,
            commands::api,
            commands::connect,
            commands::disconnect,
            commands::tunnel_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hidenseek VPN");
}
