// Package netutil holds host networking helpers that shell out to iproute2/iptables.
package netutil

import (
	"fmt"
	"net"
	"os/exec"
	"strings"
)

// Run executes a command and folds its output into the error, so failures are actionable in logs.
func Run(name string, args ...string) error {
	out, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

// DefaultInterface returns the interface carrying the default IPv4 route (the VPS's uplink).
func DefaultInterface() (string, error) {
	out, err := exec.Command("ip", "-4", "route", "show", "default").Output()
	if err != nil {
		return "", fmt.Errorf("ip route: %w", err)
	}
	fields := strings.Fields(string(out))
	for i, f := range fields {
		if f == "dev" && i+1 < len(fields) {
			return fields[i+1], nil
		}
	}
	return "", fmt.Errorf("no default route found")
}

// PublicIPv4 returns the source address the host uses for outbound traffic, if it is public.
// Dialing UDP sends no packets; it only asks the kernel which address it would use.
func PublicIPv4() string {
	conn, err := net.Dial("udp4", "1.1.1.1:53")
	if err != nil {
		return ""
	}
	defer conn.Close()
	ip := conn.LocalAddr().(*net.UDPAddr).IP
	if ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return ""
	}
	return ip.String()
}

// EnsureIptables adds a rule unless an identical one already exists.
func EnsureIptables(table string, rule ...string) error {
	check := append([]string{"-t", table, "-C"}, rule...)
	if exec.Command("iptables", check...).Run() == nil {
		return nil
	}
	return Run("iptables", append([]string{"-t", table, "-A"}, rule...)...)
}

// EnsureIptablesFirst inserts a rule at the top of its chain unless it already exists.
func EnsureIptablesFirst(table string, chain string, rule ...string) error {
	check := append([]string{"-t", table, "-C", chain}, rule...)
	if exec.Command("iptables", check...).Run() == nil {
		return nil
	}
	return Run("iptables", append([]string{"-t", table, "-I", chain, "1"}, rule...)...)
}
