//! Linux: the app drives the kernel's built-in WireGuard itself (netlink, through
//! `defguard_wireguard_rs`), so users need no wireguard-tools, wg-quick or resolvconf.
//!
//! Root work runs in a one-shot helper: the app re-runs its own binary as
//! `hidenseek-app tunnel up <config>` through pkexec. The .deb/.rpm/pacman packages install a polkit
//! rule that lets the active desktop user do this without a password, as NetworkManager does for
//! VPNs. The interface, routes and DNS stay in place after the helper exits. Stats come from sysfs,
//! which any user can read.

use std::fs;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::str::FromStr;

use defguard_wireguard_rs::dns::DnsConfig;
use defguard_wireguard_rs::key::Key;
use defguard_wireguard_rs::net::IpAddrMask;
use defguard_wireguard_rs::peer::Peer;
use defguard_wireguard_rs::{InterfaceConfiguration, Kernel, WGApi, WireguardInterfaceApi};
use tokio::process::Command;

use super::TunnelStats;
use crate::store::write_private;
use crate::wgconf::INTERFACE;
use crate::{Error, Result};

/// First argument that switches the app binary into helper mode.
pub const HELPER_ARG: &str = "tunnel";
const MTU: u32 = 1420;
const MAX_CONFIG_BYTES: u64 = 16 * 1024;

fn sysfs() -> PathBuf {
    PathBuf::from("/sys/class/net").join(INTERFACE)
}

pub async fn up(dir: &Path, config: &str) -> Result<()> {
    let path = dir.join(format!("{INTERFACE}.conf"));
    write_private(&path, config.as_bytes())?;
    // Parse before asking for privileges, so a bad config never reaches a password prompt.
    Parsed::from_wg_quick(config)?;
    privileged(&["up", &path.to_string_lossy()]).await
}

pub async fn down(_dir: &Path) -> Result<()> {
    if !sysfs().exists() {
        return Ok(());
    }
    privileged(&["down"]).await
}

pub async fn stats() -> Result<TunnelStats> {
    let dir = sysfs();
    if !dir.exists() {
        return Ok(TunnelStats::default());
    }
    let read = |name: &str| -> u64 {
        fs::read_to_string(dir.join("statistics").join(name))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0)
    };
    Ok(TunnelStats { up: true, rx_bytes: read("rx_bytes"), tx_bytes: read("tx_bytes"), last_handshake: None })
}

/// The binary pkexec should run: the AppImage file itself when running from one (root cannot see
/// the user's FUSE mount), otherwise this executable.
fn helper_program() -> Result<PathBuf> {
    if let Some(appimage) = std::env::var_os("APPIMAGE") {
        return Ok(PathBuf::from(appimage));
    }
    std::env::current_exe().map_err(|e| Error::Tunnel(format!("cannot locate the app binary: {e}")))
}

async fn privileged(args: &[&str]) -> Result<()> {
    let program = helper_program()?;
    let output = Command::new("pkexec")
        .arg(&program)
        .arg(HELPER_ARG)
        .args(args)
        .output()
        .await
        .map_err(|e| Error::Tunnel(format!("could not run pkexec ({e}); install polkit")))?;
    match output.status.code() {
        Some(0) => Ok(()),
        Some(126) | Some(127) => Err(Error::Tunnel("Permission to manage the VPN was denied".into())),
        _ => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(Error::Tunnel(if stderr.is_empty() { "Could not start the tunnel".into() } else { stderr }))
        }
    }
}

/// Entry point of `hidenseek-app tunnel <up FILE|down>`, run as root by pkexec. Returns the exit code.
pub fn helper_main(args: &[String]) -> i32 {
    let result = match args {
        [cmd, path] if cmd == "up" => helper_up(Path::new(path)),
        [cmd] if cmd == "down" => helper_down(),
        _ => Err(Error::Tunnel("usage: hidenseek-app tunnel <up CONFIG|down>".into())),
    };
    match result {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

fn helper_up(path: &Path) -> Result<()> {
    require_root()?;
    let config = read_caller_file(path)?;
    let parsed = Parsed::from_wg_quick(&config)?;

    let mut api = WGApi::<Kernel>::new(INTERFACE.to_string()).map_err(tunnel_err)?;
    if sysfs().exists() {
        // Switching servers: start from a clean interface, routes and DNS.
        api.remove_interface().map_err(tunnel_err)?;
    }
    api.create_interface().map_err(tunnel_err)?;
    let peer = Peer {
        public_key: parsed.server_key.clone(),
        preshared_key: None,
        protocol_version: None,
        endpoint: Some(parsed.endpoint),
        last_handshake: None,
        tx_bytes: 0,
        rx_bytes: 0,
        persistent_keepalive_interval: Some(parsed.keepalive),
        allowed_ips: parsed.allowed_ips.clone(),
    };
    let interface = InterfaceConfiguration {
        name: INTERFACE.to_string(),
        prvkey: parsed.private_key.clone(),
        addresses: vec![parsed.address.clone()],
        port: 0,
        peers: vec![peer],
        mtu: Some(MTU),
        fwmark: None,
    };
    let configured = api
        .configure_interface(&interface)
        .and_then(|_| api.configure_peer_routing(&interface.peers));
    if let Err(e) = configured {
        let _ = api.remove_interface();
        return Err(tunnel_err(e));
    }
    // Best effort: every packet already goes through the tunnel, so a host without systemd-resolved
    // or resolvconf still works; it just keeps its own resolver.
    if let Err(e) = api.set_dns(&DnsConfig::full_tunnel(&parsed.dns)) {
        eprintln!("warning: could not point DNS at the tunnel: {e}");
    }
    Ok(())
}

fn helper_down() -> Result<()> {
    require_root()?;
    if !sysfs().exists() {
        return Ok(());
    }
    let api = WGApi::<Kernel>::new(INTERFACE.to_string()).map_err(tunnel_err)?;
    api.remove_interface().map_err(tunnel_err)
}

fn tunnel_err(e: impl std::fmt::Display) -> Error {
    Error::Tunnel(e.to_string())
}

fn require_root() -> Result<()> {
    let uid = fs::metadata("/proc/self").map(|m| m.uid()).unwrap_or(u32::MAX);
    if uid != 0 {
        return Err(Error::Tunnel("the tunnel helper must run as root (through pkexec)".into()));
    }
    Ok(())
}

/// Reads the config the app wrote, refusing anything that isn't a small regular file owned by the
/// user who invoked pkexec, so the passwordless rule cannot be used to read other files as root.
fn read_caller_file(path: &Path) -> Result<String> {
    let meta = fs::symlink_metadata(path)?;
    if !meta.file_type().is_file() || meta.len() > MAX_CONFIG_BYTES {
        return Err(Error::Tunnel("invalid tunnel config file".into()));
    }
    if let Some(caller) = std::env::var("PKEXEC_UID").ok().and_then(|v| v.parse::<u32>().ok()) {
        if meta.uid() != caller {
            return Err(Error::Tunnel("the tunnel config must belong to the calling user".into()));
        }
    }
    Ok(fs::read_to_string(path)?)
}

/// The subset of wg-quick syntax that `wgconf::render` produces, validated field by field.
#[derive(Debug)]
pub(crate) struct Parsed {
    private_key: String,
    address: IpAddrMask,
    dns: Vec<IpAddr>,
    server_key: Key,
    endpoint: SocketAddr,
    allowed_ips: Vec<IpAddrMask>,
    keepalive: u16,
}

impl Parsed {
    pub(crate) fn from_wg_quick(text: &str) -> Result<Self> {
        let bad = |what: &str| Error::Tunnel(format!("tunnel config: invalid {what}"));
        let mut section = "";
        let (mut private_key, mut address, mut dns, mut server, mut endpoint, mut allowed, mut keepalive) =
            (None, None, Vec::new(), None, None, Vec::new(), 25u16);
        for line in text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
            if line.starts_with('[') {
                section = line;
                continue;
            }
            let Some((key, value)) = line.split_once('=') else { return Err(bad("line")) };
            let (key, value) = (key.trim(), value.trim());
            match (section, key) {
                ("[Interface]", "PrivateKey") => {
                    Key::try_from(value).map_err(|_| bad("private key"))?;
                    private_key = Some(value.to_string());
                }
                ("[Interface]", "Address") => address = Some(IpAddrMask::from_str(value).map_err(|_| bad("address"))?),
                ("[Interface]", "DNS") => {
                    for ip in value.split(',') {
                        dns.push(ip.trim().parse().map_err(|_| bad("DNS server"))?);
                    }
                }
                ("[Interface]", "MTU") => {}
                ("[Peer]", "PublicKey") => server = Some(Key::try_from(value).map_err(|_| bad("server key"))?),
                ("[Peer]", "Endpoint") => endpoint = Some(resolve(value).ok_or_else(|| bad("endpoint"))?),
                ("[Peer]", "AllowedIPs") => {
                    for cidr in value.split(',') {
                        allowed.push(IpAddrMask::from_str(cidr.trim()).map_err(|_| bad("allowed IPs"))?);
                    }
                }
                ("[Peer]", "PersistentKeepalive") => keepalive = value.parse().map_err(|_| bad("keepalive"))?,
                _ => return Err(bad(&format!("setting {key}"))),
            }
        }
        Ok(Self {
            private_key: private_key.ok_or_else(|| bad("private key"))?,
            address: address.ok_or_else(|| bad("address"))?,
            dns,
            server_key: server.ok_or_else(|| bad("server key"))?,
            endpoint: endpoint.ok_or_else(|| bad("endpoint"))?,
            allowed_ips: if allowed.is_empty() { return Err(bad("allowed IPs")) } else { allowed },
            keepalive,
        })
    }
}

/// "host:port" to a socket address, preferring IPv4 (the tunnel servers listen on IPv4).
fn resolve(endpoint: &str) -> Option<SocketAddr> {
    let addrs: Vec<SocketAddr> = endpoint.to_socket_addrs().ok()?.collect();
    addrs.iter().find(|a| a.is_ipv4()).or(addrs.first()).copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::api::TunnelConfig;
    use crate::wgconf;

    fn tunnel() -> TunnelConfig {
        TunnelConfig {
            node_id: "n".into(),
            node_name: "Singapore 1".into(),
            country_code: "SG".into(),
            address: "10.66.0.2/32".into(),
            dns: vec!["10.66.0.1".into()],
            server_public_key: "hSDwCYkwp1R0i33ctD73Wg2/Og0mOBr066SpjqqbTmo=".into(),
            endpoint: "127.0.0.1:51820".into(),
            allowed_ips: vec!["0.0.0.0/0".into(), "::/0".into()],
            persistent_keepalive: 25,
            activity_logging: false,
        }
    }

    #[test]
    fn parses_what_wgconf_renders() {
        let text = wgconf::render(&tunnel(), "dwdtCnMYpX08FsFyUbJmRd9ML4frwJkqsXf7pR25LCo=");
        let parsed = Parsed::from_wg_quick(&text).unwrap();
        assert_eq!(parsed.address.to_string(), "10.66.0.2/32");
        assert_eq!(parsed.dns, vec!["10.66.0.1".parse::<IpAddr>().unwrap()]);
        assert_eq!(parsed.endpoint, "127.0.0.1:51820".parse().unwrap());
        assert_eq!(parsed.allowed_ips.len(), 2);
        assert_eq!(parsed.keepalive, 25);
    }

    #[test]
    fn rejects_unknown_or_malformed_settings() {
        let good = wgconf::render(&tunnel(), "dwdtCnMYpX08FsFyUbJmRd9ML4frwJkqsXf7pR25LCo=");
        assert!(Parsed::from_wg_quick(&good.replace("MTU = 1420", "PostUp = rm -rf /")).is_err());
        assert!(Parsed::from_wg_quick(&good.replace("10.66.0.2/32", "not-an-ip")).is_err());
        assert!(Parsed::from_wg_quick(&good.replace("PrivateKey = dwdt", "PrivateKey = zz")).is_err());
        assert!(Parsed::from_wg_quick("[Interface]\nAddress = 10.0.0.2/32\n").is_err());
    }

    #[test]
    fn helper_refuses_to_run_unprivileged() {
        if fs::metadata("/proc/self").map(|m| m.uid()).unwrap_or(0) != 0 {
            assert_eq!(helper_main(&["down".into()]), 1);
        }
    }
}
