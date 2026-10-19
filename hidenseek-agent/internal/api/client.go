// Package api is the agent's client for the backend's /agent/v1 endpoints.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

func New(baseURL, token string) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

type EnrollRequest struct {
	Token        string `json:"token"`
	PublicKey    string `json:"publicKey"`
	ListenPort   int    `json:"listenPort"`
	DetectedHost string `json:"detectedHost,omitempty"`
	AgentVersion string `json:"agentVersion"`
}

type EnrollResponse struct {
	NodeID     string `json:"nodeId"`
	AgentToken string `json:"agentToken"`
}

type NodeState struct {
	NodeID          string     `json:"nodeId"`
	Address         string     `json:"address"`
	ListenPort      int        `json:"listenPort"`
	UpstreamDNS     []string   `json:"upstreamDns"`
	ActivityLogging bool       `json:"activityLogging"`
	Peers           []PeerSpec `json:"peers"`
}

type PeerSpec struct {
	PublicKey  string   `json:"publicKey"`
	AllowedIPs []string `json:"allowedIps"`
}

type Report struct {
	AgentVersion string     `json:"agentVersion"`
	Peers        []PeerStat `json:"peers"`
	DNS          []DNSEvent `json:"dns,omitempty"`
}

// PeerStat carries WireGuard's cumulative counters from the server's side:
// RxBytes is what the client uploaded, TxBytes what it downloaded.
type PeerStat struct {
	PublicKey     string     `json:"publicKey"`
	Endpoint      string     `json:"endpoint,omitempty"`
	LastHandshake *time.Time `json:"lastHandshake,omitempty"`
	RxBytes       int64      `json:"rxBytes"`
	TxBytes       int64      `json:"txBytes"`
}

type DNSEvent struct {
	ClientIP string    `json:"clientIp"`
	Domain   string    `json:"domain"`
	Type     string    `json:"type"`
	At       time.Time `json:"at"`
}

func (c *Client) Enroll(ctx context.Context, req EnrollRequest) (*EnrollResponse, error) {
	var res EnrollResponse
	return &res, c.do(ctx, http.MethodPost, "/agent/v1/enroll", req, &res)
}

func (c *Client) State(ctx context.Context) (*NodeState, error) {
	var res NodeState
	return &res, c.do(ctx, http.MethodGet, "/agent/v1/state", nil, &res)
}

func (c *Client) Report(ctx context.Context, report Report) error {
	return c.do(ctx, http.MethodPost, "/agent/v1/report", report, nil)
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(res.Body, 2048))
		return fmt.Errorf("%s %s: %s %s", method, path, res.Status, strings.TrimSpace(string(msg)))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(res.Body).Decode(out)
}
