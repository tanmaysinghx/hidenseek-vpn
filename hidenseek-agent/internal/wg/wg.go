// Package wg owns the node's WireGuard interface: creating it, routing for it, and keeping its
// peers equal to the backend's desired state.
package wg

import (
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/exec"
	"strings"
	"time"

	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"

	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/api"
	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/netutil"
)

const mtu = "1420"

type Interface struct {
	name       string
	privateKey wgtypes.Key
	client     *wgctrl.Client
	address    string
	listenPort int
}

func Open(name, privateKey string) (*Interface, error) {
	key, err := wgtypes.ParseKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("private key: %w", err)
	}
	client, err := wgctrl.New()
	if err != nil {
		return nil, fmt.Errorf("wgctrl: %w", err)
	}
	return &Interface{name: name, privateKey: key, client: client}, nil
}

func (i *Interface) Close() error { return i.client.Close() }

func (i *Interface) Name() string { return i.name }

// Ensure creates and configures the interface and NAT if needed. It is idempotent and cheap
// when nothing changed, so it runs on every poll and repairs drift (e.g. after `ip link del`).
func (i *Interface) Ensure(address string, listenPort int) error {
	if _, err := net.InterfaceByName(i.name); err != nil {
		slog.Info("creating WireGuard interface", "interface", i.name)
		if err := netutil.Run("ip", "link", "add", "dev", i.name, "type", "wireguard"); err != nil {
			return fmt.Errorf("%w (is the wireguard kernel module available?)", err)
		}
		i.address, i.listenPort = "", 0
	}
	if i.listenPort != listenPort {
		if err := i.client.ConfigureDevice(i.name, wgtypes.Config{PrivateKey: &i.privateKey, ListenPort: &listenPort}); err != nil {
			return fmt.Errorf("configure %s: %w", i.name, err)
		}
		i.listenPort = listenPort
	}
	if i.address != address {
		if err := netutil.Run("ip", "address", "replace", address, "dev", i.name); err != nil {
			return err
		}
		if err := netutil.Run("ip", "link", "set", "mtu", mtu, "up", "dev", i.name); err != nil {
			return err
		}
		if err := i.ensureRouting(address); err != nil {
			return err
		}
		i.address = address
	}
	return nil
}

func (i *Interface) ensureRouting(address string) error {
	_, subnet, err := net.ParseCIDR(address)
	if err != nil {
		return fmt.Errorf("address %q: %w", address, err)
	}
	if err := os.WriteFile("/proc/sys/net/ipv4/ip_forward", []byte("1"), 0o644); err != nil {
		return fmt.Errorf("enable ip_forward: %w", err)
	}
	uplink, err := netutil.DefaultInterface()
	if err != nil {
		return err
	}
	if _, err := exec.LookPath("iptables"); err != nil {
		return fmt.Errorf("iptables not found: install iptables (or iptables-nft)")
	}
	cidr := subnet.String()
	rules := []struct {
		table, chain string
		rule         []string
		first        bool
	}{
		{"nat", "POSTROUTING", []string{"POSTROUTING", "-s", cidr, "-o", uplink, "-j", "MASQUERADE"}, false},
		// Clients can reach the internet and the node's resolver, but not each other.
		{"filter", "FORWARD", []string{"-i", i.name, "-o", i.name, "-j", "DROP"}, true},
		{"filter", "FORWARD", []string{"-i", i.name, "-o", uplink, "-j", "ACCEPT"}, true},
		{"filter", "FORWARD", []string{"-i", uplink, "-o", i.name, "-m", "conntrack", "--ctstate", "RELATED,ESTABLISHED", "-j", "ACCEPT"}, true},
		{"filter", "INPUT", []string{"-i", i.name, "-p", "udp", "--dport", "53", "-j", "ACCEPT"}, true},
		{"filter", "INPUT", []string{"-i", i.name, "-p", "tcp", "--dport", "53", "-j", "ACCEPT"}, true},
		// Keep TCP working over the smaller tunnel MTU.
		{"mangle", "FORWARD", []string{"-o", i.name, "-p", "tcp", "--tcp-flags", "SYN,RST", "SYN", "-j", "TCPMSS", "--clamp-mss-to-pmtu"}, true},
	}
	for _, r := range rules {
		var err error
		if r.first {
			err = netutil.EnsureIptablesFirst(r.table, r.chain, r.rule...)
		} else {
			err = netutil.EnsureIptables(r.table, r.rule...)
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// SyncPeers adds, updates and removes peers so the device matches desired, without touching
// peers that are already correct (replacing them would drop their live sessions).
func (i *Interface) SyncPeers(desired []api.PeerSpec) (added, removed int, err error) {
	device, err := i.client.Device(i.name)
	if err != nil {
		return 0, 0, err
	}
	current := make(map[wgtypes.Key]wgtypes.Peer, len(device.Peers))
	for _, p := range device.Peers {
		current[p.PublicKey] = p
	}
	want := make(map[wgtypes.Key]bool, len(desired))
	var changes []wgtypes.PeerConfig
	for _, spec := range desired {
		key, err := wgtypes.ParseKey(spec.PublicKey)
		if err != nil {
			slog.Warn("skipping peer with invalid key", "key", spec.PublicKey)
			continue
		}
		ips, err := parseCIDRs(spec.AllowedIPs)
		if err != nil {
			slog.Warn("skipping peer with invalid allowed IPs", "key", spec.PublicKey, "err", err)
			continue
		}
		want[key] = true
		if existing, ok := current[key]; ok && sameIPs(existing.AllowedIPs, ips) {
			continue
		}
		changes = append(changes, wgtypes.PeerConfig{PublicKey: key, ReplaceAllowedIPs: true, AllowedIPs: ips})
		added++
	}
	for key := range current {
		if !want[key] {
			changes = append(changes, wgtypes.PeerConfig{PublicKey: key, Remove: true})
			removed++
		}
	}
	if len(changes) == 0 {
		return 0, 0, nil
	}
	return added, removed, i.client.ConfigureDevice(i.name, wgtypes.Config{Peers: changes})
}

func (i *Interface) Stats() ([]api.PeerStat, error) {
	device, err := i.client.Device(i.name)
	if err != nil {
		return nil, err
	}
	stats := make([]api.PeerStat, 0, len(device.Peers))
	for _, p := range device.Peers {
		s := api.PeerStat{PublicKey: p.PublicKey.String(), RxBytes: p.ReceiveBytes, TxBytes: p.TransmitBytes}
		if p.Endpoint != nil {
			s.Endpoint = p.Endpoint.String()
		}
		if !p.LastHandshakeTime.IsZero() {
			t := p.LastHandshakeTime.UTC().Truncate(time.Second)
			s.LastHandshake = &t
		}
		stats = append(stats, s)
	}
	return stats, nil
}

func parseCIDRs(values []string) ([]net.IPNet, error) {
	out := make([]net.IPNet, 0, len(values))
	for _, v := range values {
		_, n, err := net.ParseCIDR(strings.TrimSpace(v))
		if err != nil {
			return nil, err
		}
		out = append(out, *n)
	}
	return out, nil
}

func sameIPs(a, b []net.IPNet) bool {
	if len(a) != len(b) {
		return false
	}
	seen := make(map[string]bool, len(a))
	for _, n := range a {
		seen[n.String()] = true
	}
	for _, n := range b {
		if !seen[n.String()] {
			return false
		}
	}
	return true
}
