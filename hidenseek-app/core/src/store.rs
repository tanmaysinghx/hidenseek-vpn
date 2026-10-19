//! Persistent app state, kept as JSON in the app's data directory and readable by the user only.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::oidc::{PortalConfig, Tokens};
use crate::Result;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub api_url: Option<String>,
    pub portal: Option<PortalConfig>,
    pub tokens: Option<Tokens>,
    pub device: Option<DeviceIdentity>,
    pub last_node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
    pub id: String,
    pub private_key: String,
    pub public_key: String,
}

pub struct Store {
    dir: PathBuf,
    state: Mutex<State>,
}

impl Store {
    pub fn open(dir: impl Into<PathBuf>) -> Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir)?;
        let state = match fs::read(dir.join("state.json")) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => State::default(),
            Err(e) => return Err(e.into()),
        };
        Ok(Self { dir, state: Mutex::new(state) })
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn get(&self) -> State {
        self.state.lock().unwrap().clone()
    }

    pub fn update(&self, f: impl FnOnce(&mut State)) -> Result<State> {
        let mut state = self.state.lock().unwrap();
        f(&mut state);
        write_private(&self.dir.join("state.json"), &serde_json::to_vec_pretty(&*state)?)?;
        Ok(state.clone())
    }
}

/// Writes a file only the current user can read: state.json and tunnel configs hold secrets.
pub fn write_private(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut options = fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        use std::io::Write;
        options.open(&tmp)?.write_all(contents)?;
    }
    fs::rename(tmp, path)
}
