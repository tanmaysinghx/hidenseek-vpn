// Package agent runs the node's control loops: pull desired state, apply it, push stats.
package agent

import (
	"context"
	"log/slog"
	"net"
	"time"

	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/api"
	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/dnsproxy"
	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/wg"
)

const (
	PollInterval   = 5 * time.Second
	ReportInterval = 30 * time.Second
)

type Agent struct {
	api     *api.Client
	iface   *wg.Interface
	version string
	dns     *dnsproxy.Proxy
}

func New(client *api.Client, iface *wg.Interface, version string) *Agent {
	return &Agent{api: client, iface: iface, version: version}
}

func (a *Agent) Run(ctx context.Context) error {
	poll := time.NewTicker(PollInterval)
	report := time.NewTicker(ReportInterval)
	defer poll.Stop()
	defer report.Stop()
	defer func() {
		if a.dns != nil {
			a.dns.Stop()
		}
	}()

	a.sync(ctx)
	a.report(ctx)
	for {
		select {
		case <-ctx.Done():
			// Flush buffered activity and final counters so sessions close accurately.
			flush, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			a.report(flush)
			cancel()
			return nil
		case <-poll.C:
			a.sync(ctx)
		case <-report.C:
			a.report(ctx)
		}
	}
}

func (a *Agent) sync(ctx context.Context) {
	state, err := a.api.State(ctx)
	if err != nil {
		slog.Warn("fetching desired state failed", "err", err)
		return
	}
	if err := a.iface.Ensure(state.Address, state.ListenPort); err != nil {
		slog.Error("configuring interface failed", "err", err)
		return
	}
	added, removed, err := a.iface.SyncPeers(state.Peers)
	if err != nil {
		slog.Error("syncing peers failed", "err", err)
	} else if added+removed > 0 {
		slog.Info("peers updated", "added", added, "removed", removed, "total", len(state.Peers))
	}
	a.ensureDNS(state)
}

func (a *Agent) ensureDNS(state *api.NodeState) {
	gateway, _, err := net.ParseCIDR(state.Address)
	if err != nil {
		slog.Error("bad node address", "address", state.Address)
		return
	}
	listen := net.JoinHostPort(gateway.String(), "53")
	if a.dns != nil && a.dns.Listen() != listen {
		a.dns.Stop()
		a.dns = nil
	}
	if a.dns == nil {
		proxy := dnsproxy.New(listen)
		if err := proxy.Start(); err != nil {
			slog.Error("starting DNS resolver failed; clients will have no DNS", "err", err)
			return
		}
		a.dns = proxy
	}
	a.dns.SetUpstreams(state.UpstreamDNS)
	a.dns.SetLogging(state.ActivityLogging)
}

func (a *Agent) report(ctx context.Context) {
	stats, err := a.iface.Stats()
	if err != nil {
		slog.Warn("reading peer stats failed", "err", err)
		return
	}
	var events []api.DNSEvent
	if a.dns != nil {
		events = a.dns.Drain()
	}
	if err := a.api.Report(ctx, api.Report{AgentVersion: a.version, Peers: stats, DNS: events}); err != nil {
		slog.Warn("sending report failed", "err", err)
		if a.dns != nil {
			a.dns.Requeue(events)
		}
	}
}
