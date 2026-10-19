// hidenseek-agent turns a Linux VPS into a Hidenseek VPN node.
//
//	hidenseek-agent enroll --api https://vpn.example.com --token hsn_enroll_...
//	hidenseek-agent run
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"

	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/agent"
	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/api"
	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/config"
	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/netutil"
	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/wg"
)

// version is set at build time: -ldflags "-X main.version=1.2.3".
var version = "dev"

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})))
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "enroll":
		err = enroll(os.Args[2:])
	case "run":
		err = run(os.Args[2:])
	case "version", "--version":
		fmt.Println(version)
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		slog.Error(err.Error())
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `usage:
  hidenseek-agent enroll --api URL --token TOKEN [--port 51820] [--interface hs0] [--host PUBLIC_HOST]
  hidenseek-agent run [--config /etc/hidenseek/agent.json]
  hidenseek-agent version`)
}

func enroll(args []string) error {
	fs := flag.NewFlagSet("enroll", flag.ExitOnError)
	apiURL := fs.String("api", "", "backend URL, e.g. https://vpn.example.com")
	token := fs.String("token", "", "enrollment token from the admin console")
	port := fs.Int("port", 51820, "WireGuard UDP listen port")
	iface := fs.String("interface", "hs0", "WireGuard interface name")
	host := fs.String("host", "", "public hostname/IP clients dial (auto-detected when empty)")
	path := fs.String("config", config.DefaultPath, "config file to write")
	_ = fs.Parse(args)
	if *apiURL == "" || *token == "" {
		return fmt.Errorf("--api and --token are required")
	}

	key, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		return err
	}
	detected := *host
	if detected == "" {
		detected = netutil.PublicIPv4()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	res, err := api.New(*apiURL, "").Enroll(ctx, api.EnrollRequest{
		Token:        *token,
		PublicKey:    key.PublicKey().String(),
		ListenPort:   *port,
		DetectedHost: detected,
		AgentVersion: version,
	})
	if err != nil {
		return fmt.Errorf("enrollment failed: %w", err)
	}
	cfg := &config.Config{
		APIURL:     *apiURL,
		NodeID:     res.NodeID,
		AgentToken: res.AgentToken,
		PrivateKey: key.String(),
		Interface:  *iface,
		ListenPort: *port,
	}
	if err := config.Save(*path, cfg); err != nil {
		return fmt.Errorf("saving config: %w", err)
	}
	slog.Info("node enrolled", "nodeId", res.NodeID, "config", *path, "publicHost", detected)
	return nil
}

func run(args []string) error {
	fs := flag.NewFlagSet("run", flag.ExitOnError)
	path := fs.String("config", config.DefaultPath, "config file written by enroll")
	_ = fs.Parse(args)

	cfg, err := config.Load(*path)
	if err != nil {
		return err
	}
	iface, err := wg.Open(cfg.Interface, cfg.PrivateKey)
	if err != nil {
		return err
	}
	defer iface.Close()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	slog.Info("hidenseek-agent starting", "version", version, "node", cfg.NodeID, "interface", cfg.Interface)
	return agent.New(api.New(cfg.APIURL, cfg.AgentToken), iface, version).Run(ctx)
}
