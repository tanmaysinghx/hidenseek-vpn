// Package config persists the agent's identity: written once by `enroll`, read by `run`.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const DefaultPath = "/etc/hidenseek/agent.json"

type Config struct {
	APIURL     string `json:"apiUrl"`
	NodeID     string `json:"nodeId"`
	AgentToken string `json:"agentToken"`
	PrivateKey string `json:"privateKey"`
	Interface  string `json:"interface"`
	ListenPort int    `json:"listenPort"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("%s not found: run `hidenseek-agent enroll` first", path)
	}
	if err != nil {
		return nil, err
	}
	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	if c.APIURL == "" || c.AgentToken == "" || c.PrivateKey == "" {
		return nil, fmt.Errorf("%s is incomplete: re-run `hidenseek-agent enroll`", path)
	}
	if c.Interface == "" {
		c.Interface = "hs0"
	}
	return &c, nil
}

// Save writes the config readable by root only: it holds the node's private key and API token.
func Save(path string, c *Config) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
