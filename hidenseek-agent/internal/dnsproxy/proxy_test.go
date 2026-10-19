package dnsproxy

import (
	"net"
	"testing"

	"github.com/miekg/dns"
)

// fakeUpstream answers every A query with 192.0.2.1.
func fakeUpstream(t *testing.T) string {
	t.Helper()
	pc, err := net.ListenPacket("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := &dns.Server{PacketConn: pc, Handler: dns.HandlerFunc(func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		rr, _ := dns.NewRR(r.Question[0].Name + " 60 IN A 192.0.2.1")
		m.Answer = append(m.Answer, rr)
		_ = w.WriteMsg(m)
	})}
	go func() { _ = server.ActivateAndServe() }()
	t.Cleanup(func() { _ = server.Shutdown() })
	return pc.LocalAddr().String()
}

func freeAddr(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return l.Addr().String()
}

func query(t *testing.T, addr, name string) *dns.Msg {
	t.Helper()
	m := new(dns.Msg)
	m.SetQuestion(dns.Fqdn(name), dns.TypeA)
	res, _, err := new(dns.Client).Exchange(m, addr)
	if err != nil {
		t.Fatal(err)
	}
	return res
}

func TestForwardsAndRecordsOnlyWhenLogging(t *testing.T) {
	p := New(freeAddr(t))
	p.SetUpstreams([]string{fakeUpstream(t)})
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	defer p.Stop()

	if res := query(t, p.Listen(), "private.example"); len(res.Answer) != 1 {
		t.Fatalf("expected an answer, got %v", res)
	}
	if got := p.Drain(); len(got) != 0 {
		t.Fatalf("logging is off but recorded %v", got)
	}

	p.SetLogging(true)
	query(t, p.Listen(), "Example.COM")
	events := p.Drain()
	if len(events) != 1 || events[0].Domain != "example.com" || events[0].Type != "A" || events[0].ClientIP != "127.0.0.1" {
		t.Fatalf("unexpected events %+v", events)
	}

	p.Requeue(events)
	p.SetLogging(false)
	if got := p.Drain(); len(got) != 0 {
		t.Fatalf("disabling logging must discard unsent events, got %v", got)
	}
}
