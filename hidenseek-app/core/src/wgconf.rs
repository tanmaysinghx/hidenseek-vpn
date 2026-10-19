//! Renders a wg-quick style config, the format WireGuard uses on Linux, Windows and Android.

use crate::api::TunnelConfig;

pub const INTERFACE: &str = "hidenseek";
const MTU: u16 = 1420;

pub fn render(tunnel: &TunnelConfig, private_key: &str) -> String {
    format!(
        "[Interface]\n\
         PrivateKey = {private_key}\n\
         Address = {address}\n\
         DNS = {dns}\n\
         MTU = {MTU}\n\
         \n\
         [Peer]\n\
         PublicKey = {server}\n\
         AllowedIPs = {allowed}\n\
         Endpoint = {endpoint}\n\
         PersistentKeepalive = {keepalive}\n",
        address = tunnel.address,
        dns = tunnel.dns.join(", "),
        server = tunnel.server_public_key,
        allowed = tunnel.allowed_ips.join(", "),
        endpoint = tunnel.endpoint,
        keepalive = tunnel.persistent_keepalive,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_full_tunnel_config() {
        let tunnel = TunnelConfig {
            node_id: "n".into(),
            node_name: "Singapore 1".into(),
            country_code: "SG".into(),
            address: "10.66.0.2/32".into(),
            dns: vec!["10.66.0.1".into()],
            server_public_key: "SERVER=".into(),
            endpoint: "sg1.example.com:51820".into(),
            allowed_ips: vec!["0.0.0.0/0".into(), "::/0".into()],
            persistent_keepalive: 25,
            activity_logging: false,
        };
        let conf = render(&tunnel, "PRIVATE=");
        assert!(conf.contains("PrivateKey = PRIVATE=\nAddress = 10.66.0.2/32\nDNS = 10.66.0.1\n"));
        assert!(conf.contains("AllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = sg1.example.com:51820\n"));
    }
}
