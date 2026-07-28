package model

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Profile struct {
	Role string `json:"role"`
}

func ProfilePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "courtdesk", "profile.json")
}

func LoadProfile() *Profile {
	p := &Profile{Role: "user"}
	data, err := os.ReadFile(ProfilePath())
	if err != nil {
		return p
	}
	if err := json.Unmarshal(data, p); err != nil {
		return &Profile{Role: "user"}
	}
	return p
}

func (p *Profile) Save() error {
	dir := filepath.Dir(ProfilePath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ProfilePath(), data, 0644)
}
