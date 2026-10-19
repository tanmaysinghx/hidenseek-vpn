#!/usr/bin/env bash
# Installs hidenseek-agent on a Linux VPS and enrolls it as a VPN node.
#
#   curl -fsSL https://vpn.example.com/install.sh | sudo bash -s -- --api https://vpn.example.com --token hsn_enroll_...
#
# Options: --port 51820  --host PUBLIC_HOST  --interface hs0  --version v0.1.0  --binary ./hidenseek-agent
set -euo pipefail

REPO="tanmaysinghx/hidenseek-vpn"
API="" TOKEN="" PORT="51820" HOST="" IFACE="hs0" VERSION="latest" BINARY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api) API="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --interface) IFACE="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --binary) BINARY="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run as root (sudo)"
[[ -n "$API" && -n "$TOKEN" ]] || die "--api and --token are required (copy the command from the admin console)"
[[ "$(uname -s)" == "Linux" ]] || die "only Linux is supported"

case "$(uname -m)" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) die "unsupported CPU architecture $(uname -m)" ;;
esac

say "Checking WireGuard kernel support"
modprobe wireguard 2>/dev/null || true
if ! ip link add hs-probe type wireguard 2>/dev/null; then
  die "this kernel has no WireGuard support (needs Linux 5.6+, or install wireguard-dkms)"
fi
ip link del hs-probe

if ! command -v iptables >/dev/null; then
  say "Installing iptables"
  if command -v apt-get >/dev/null; then apt-get update -qq && apt-get install -y -qq iptables
  elif command -v dnf >/dev/null; then dnf install -y -q iptables
  elif command -v yum >/dev/null; then yum install -y -q iptables
  elif command -v pacman >/dev/null; then pacman -Sy --noconfirm iptables-nft
  else die "install iptables and re-run"; fi
fi

say "Installing hidenseek-agent"
if [[ -n "$BINARY" ]]; then
  install -m 0755 "$BINARY" /usr/local/bin/hidenseek-agent
else
  if [[ "$VERSION" == "latest" ]]; then
    URL="https://github.com/$REPO/releases/latest/download/hidenseek-agent-linux-$ARCH"
  else
    URL="https://github.com/$REPO/releases/download/$VERSION/hidenseek-agent-linux-$ARCH"
  fi
  TMP="$(mktemp)"
  trap 'rm -f "$TMP" "$TMP.sha256"' EXIT
  curl -fsSL "$URL" -o "$TMP" || die "download failed: $URL"
  if curl -fsSL "$URL.sha256" -o "$TMP.sha256" 2>/dev/null; then
    echo "$(cut -d' ' -f1 "$TMP.sha256")  $TMP" | sha256sum -c --quiet - || die "checksum mismatch"
  fi
  install -m 0755 "$TMP" /usr/local/bin/hidenseek-agent
fi

say "Enrolling node with $API"
ENROLL=(enroll --api "$API" --token "$TOKEN" --port "$PORT" --interface "$IFACE")
[[ -n "$HOST" ]] && ENROLL+=(--host "$HOST")
/usr/local/bin/hidenseek-agent "${ENROLL[@]}"

say "Opening UDP $PORT"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT/udp" >/dev/null
elif command -v firewall-cmd >/dev/null && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-port="$PORT/udp" >/dev/null && firewall-cmd --reload >/dev/null
fi

say "Starting service"
cat > /etc/systemd/system/hidenseek-agent.service <<'UNIT'
[Unit]
Description=Hidenseek VPN node agent
Documentation=https://github.com/tanmaysinghx/hidenseek-vpn
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/hidenseek-agent run
Restart=always
RestartSec=5
# Runs as root: it manages the WireGuard interface, routing, iptables and DNS on port 53.
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now hidenseek-agent >/dev/null
systemctl restart hidenseek-agent

say "Done. The node should show as online in the admin console within a few seconds."
echo "    Logs: journalctl -u hidenseek-agent -f"
echo "    Remember to allow UDP $PORT in your cloud provider's firewall / security group."
