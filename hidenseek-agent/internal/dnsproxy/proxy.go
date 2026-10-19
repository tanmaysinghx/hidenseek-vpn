// Package dnsproxy is the resolver clients use inside the tunnel. Forcing DNS through the node
// stops lookups leaking to the client's ISP, and, only when the node has activity logging
// enabled, records which domains each tunnel address looked up.
package dnsproxy

import (
	"log/slog"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/miekg/dns"

	"github.com/tanmaysinghx/hidenseek-vpn/hidenseek-agent/internal/api"
)

// maxBuffered caps memory if the backend is unreachable for a long time; oldest events win.
const maxBuffered = 20000

type Proxy struct {
	listen    string
	upstreams atomic.Pointer[[]string]
	logging   atomic.Bool
	client    *dns.Client

	mu      sync.Mutex
	events  []api.DNSEvent
	servers []*dns.Server
}

// New creates a resolver for listen, e.g. "10.66.0.1:53".
func New(listen string) *Proxy {
	p := &Proxy{
		listen: listen,
		client: &dns.Client{Timeout: 4 * time.Second},
	}
	p.SetUpstreams([]string{"1.1.1.1", "9.9.9.9"})
	return p
}

func (p *Proxy) Listen() string { return p.listen }

// SetLogging turns activity recording on or off; turning it off discards anything unsent.
func (p *Proxy) SetLogging(on bool) {
	if was := p.logging.Swap(on); was && !on {
		p.mu.Lock()
		p.events = nil
		p.mu.Unlock()
	}
}

func (p *Proxy) SetUpstreams(servers []string) {
	list := make([]string, 0, len(servers))
	for _, s := range servers {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if _, _, err := net.SplitHostPort(s); err != nil {
			s = net.JoinHostPort(s, "53")
		}
		list = append(list, s)
	}
	if len(list) > 0 {
		p.upstreams.Store(&list)
	}
}

// Start serves UDP and TCP. It returns once both listeners are bound or one fails.
func (p *Proxy) Start() error {
	handler := dns.HandlerFunc(p.serve)
	errs := make(chan error, 2)
	for _, network := range []string{"udp", "tcp"} {
		ready := make(chan struct{})
		server := &dns.Server{Addr: p.listen, Net: network, Handler: handler, NotifyStartedFunc: func() { close(ready) }}
		go func() {
			if err := server.ListenAndServe(); err != nil {
				errs <- err
			}
		}()
		select {
		case <-ready:
			p.servers = append(p.servers, server)
		case err := <-errs:
			p.Stop()
			return err
		}
	}
	slog.Info("DNS resolver listening", "addr", p.listen)
	return nil
}

func (p *Proxy) Stop() {
	for _, s := range p.servers {
		_ = s.Shutdown()
	}
	p.servers = nil
}

// Drain hands buffered events to the caller, who re-queues them with Requeue if sending fails.
func (p *Proxy) Drain() []api.DNSEvent {
	p.mu.Lock()
	defer p.mu.Unlock()
	events := p.events
	p.events = nil
	return events
}

func (p *Proxy) Requeue(events []api.DNSEvent) {
	if !p.logging.Load() {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(events, p.events...)
	if len(p.events) > maxBuffered {
		p.events = p.events[:maxBuffered]
	}
}

func (p *Proxy) serve(w dns.ResponseWriter, req *dns.Msg) {
	if p.logging.Load() && len(req.Question) > 0 {
		p.record(w.RemoteAddr(), req.Question[0])
	}
	network := "udp"
	if _, ok := w.RemoteAddr().(*net.TCPAddr); ok {
		network = "tcp"
	}
	var lastErr error
	for _, upstream := range *p.upstreams.Load() {
		client := *p.client
		client.Net = network
		res, _, err := client.Exchange(req, upstream)
		if err == nil {
			_ = w.WriteMsg(res)
			return
		}
		lastErr = err
	}
	slog.Debug("all upstreams failed", "err", lastErr)
	fail := new(dns.Msg)
	fail.SetRcode(req, dns.RcodeServerFailure)
	_ = w.WriteMsg(fail)
}

func (p *Proxy) record(addr net.Addr, q dns.Question) {
	host, _, err := net.SplitHostPort(addr.String())
	if err != nil {
		return
	}
	event := api.DNSEvent{
		ClientIP: host,
		Domain:   strings.TrimSuffix(strings.ToLower(q.Name), "."),
		Type:     dns.TypeToString[q.Qtype],
		At:       time.Now().UTC(),
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.events) < maxBuffered {
		p.events = append(p.events, event)
	}
}
