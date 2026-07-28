package model

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Profile struct {
	APIURL    string `json:"apiUrl"`
	ThemeName string `json:"themeName"`
}

const defaultAPIURL = "http://127.0.0.1:8767/api"
const defaultTheme = "Slate"

func ProfilePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "courtdesk", "profile.json")
}

func LoadProfile() *Profile {
	p := &Profile{APIURL: defaultAPIURL, ThemeName: defaultTheme}
	data, err := os.ReadFile(ProfilePath())
	if err != nil {
		return p
	}
	if err := json.Unmarshal(data, p); err != nil {
		return &Profile{APIURL: defaultAPIURL, ThemeName: defaultTheme}
	}
	if p.APIURL == "" {
		p.APIURL = defaultAPIURL
	}
	if p.ThemeName == "" {
		p.ThemeName = defaultTheme
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
