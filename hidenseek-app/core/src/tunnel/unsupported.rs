use std::path::Path;

use super::TunnelStats;
use crate::{Error, Result};

pub async fn up(_dir: &Path, _config: &str) -> Result<()> {
    Err(Error::Tunnel("this platform is not supported yet".into()))
}

pub async fn down(_dir: &Path) -> Result<()> {
    Ok(())
}

pub async fn stats() -> Result<TunnelStats> {
    Ok(TunnelStats::default())
}
