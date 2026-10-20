//! Client logic shared by every Hidenseek VPN app: signing in with Portal SSO, talking to the
//! backend, managing the device's WireGuard key, and bringing the desktop tunnel up and down.
//! It has no UI or Tauri dependency, so it can be tested on its own.

pub mod account;
pub mod api;
pub mod client;
pub mod error;
pub mod keys;
pub mod oidc;
pub mod store;
pub mod tunnel;
pub mod wgconf;

pub use error::{Error, Result};
