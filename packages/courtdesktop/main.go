package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/webview/webview_go"
)

type Profile struct {
	APIURL    string `json:"apiUrl"`
	ThemeName string `json:"themeName"`
}

const defaultAPIURL = "http://127.0.0.1:8767"
const defaultTheme = "slate"

func profilePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "courtdesk", "profile.json")
}

func loadProfile() *Profile {
	p := &Profile{APIURL: defaultAPIURL, ThemeName: defaultTheme}
	data, err := os.ReadFile(profilePath())
	if err != nil {
		return p
	}
	_ = json.Unmarshal(data, p)
	if p.APIURL == "" {
		p.APIURL = defaultAPIURL
	}
	if p.ThemeName == "" {
		p.ThemeName = defaultTheme
	}
	// Normalize: remove trailing /api or /
	p.APIURL = strings.TrimSuffix(p.APIURL, "/api")
	p.APIURL = strings.TrimSuffix(p.APIURL, "/")
	return p
}

func saveProfile(p *Profile) error {
	dir := filepath.Dir(profilePath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(profilePath(), data, 0644)
}

func checkAPI(baseURL string) bool {
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(baseURL + "/api/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func main() {
	fullscreen := flag.Bool("fullscreen", false, "Full-screen mode")
	flag.Parse()

	profile := loadProfile()

	if !checkAPI(profile.APIURL) {
		showError("CourtDesk", "API server is not available at "+profile.APIURL+"\n\nStart the server first:\n  cd CourtDesk && npm start")
		os.Exit(1)
	}

	w := webview.New(!*fullscreen)
	defer w.Destroy()

	w.SetTitle("CourtDesk")

	if runtime.GOOS == "windows" {
		w.SetSize(1920, 1080, webview.HintNone)
	} else {
		w.SetSize(1920, 1080, webview.HintNone)
	}

	if *fullscreen {
		w.SetSize(1920, 1080, webview.HintMax)
	}

	settingsHTML := buildSettingsPage(profile)

	w.Bind("courtdesk", &jsAPI{profile: profile, w: w, settingsHTML: settingsHTML})

	// Inject keyboard shortcut for settings (Ctrl+,)
	w.Init(`
		document.addEventListener('keydown', function(e) {
			if (e.ctrlKey && e.key === ',') {
				e.preventDefault();
				courtdesk.OpenSettings();
			}
		});
	`)

	w.Navigate(profile.APIURL)

	w.Run()
}

type jsAPI struct {
	profile      *Profile
	w            webview.WebView
	settingsHTML string
}

func (j *jsAPI) GetSettings() string {
	data, _ := json.Marshal(j.profile)
	return string(data)
}

func (j *jsAPI) SaveSettings(apiURL string, themeName string) {
	j.profile.APIURL = apiURL
	j.profile.ThemeName = themeName
	_ = saveProfile(j.profile)
}

func (j *jsAPI) OpenSettings() {
	j.w.Navigate("data:text/html," + j.settingsHTML)
}

func (j *jsAPI) GoBack() {
	j.w.Navigate(j.profile.APIURL)
}

func buildSettingsPage(p *Profile) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>CourtDesk Settings</title>
<style>
  :root {
    --bg: #0f172a; --surface: #1e293b; --fg: #e2e8f0;
    --primary: #38bdf8; --border: #334155; --input-bg: #161b25;
  }
  [data-theme="light"] {
    --bg: #f8fafc; --surface: #ffffff; --fg: #1e293b;
    --primary: #2563eb; --border: #cbd5e1; --input-bg: #ffffff;
  }
  [data-theme="paper"] {
    --bg: #f5f0e8; --surface: #fffaf2; --fg: #3e3024;
    --primary: #8b5c2a; --border: #c8b8a0; --input-bg: #fffaf2;
  }
  [data-theme="forest"] {
    --bg: #0f1a14; --surface: #1a2e22; --fg: #d1fae5;
    --primary: #4ade80; --border: #2d4a38; --input-bg: #122218;
  }
  [data-theme="contrast"] {
    --bg: #000000; --surface: #1a1a1a; --fg: #ffffff;
    --primary: #ffff00; --border: #ffffff; --input-bg: #0a0a0a;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:var(--bg); color:var(--fg); font-family:system-ui,sans-serif; padding:40px; }
  h1 { margin-bottom:30px; font-size:24px; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:24px; margin-bottom:20px; max-width:600px; }
  label { display:block; margin-bottom:6px; font-size:14px; opacity:0.8; }
  input, select { width:100%%; padding:10px 12px; background:var(--input-bg); color:var(--fg); border:1px solid var(--border); border-radius:8px; font-size:14px; margin-bottom:16px; }
  button { padding:10px 24px; background:var(--primary); color:#000; border:none; border-radius:8px; font-size:14px; cursor:pointer; font-weight:600; margin-right:10px; }
  button:hover { opacity:0.9; }
  button.secondary { background:var(--surface); color:var(--fg); border:1px solid var(--border); }
  .status { margin-top:12px; font-size:13px; opacity:0.7; }
</style>
</head>
<body data-theme="%s">
<h1>CourtDesk Settings</h1>
<div class="card">
  <label>API URL</label>
  <input id="apiUrl" value="%s" placeholder="http://127.0.0.1:8767">
  <label>Theme</label>
  <select id="theme">
    <option value="slate">Slate (Dark)</option>
    <option value="light">Light</option>
    <option value="paper">Paper</option>
    <option value="forest">Forest</option>
    <option value="contrast">High Contrast</option>
  </select>
  <button onclick="save()">Save</button>
  <button class="secondary" onclick="back()">Back</button>
  <div class="status" id="status"></div>
</div>
<script>
  const themeSelect = document.getElementById('theme');
  themeSelect.value = '%s';
  themeSelect.addEventListener('change', function() {
    document.body.setAttribute('data-theme', this.value);
  });
  async function save() {
    const apiUrl = document.getElementById('apiUrl').value;
    const theme = document.getElementById('theme').value;
    await courtdesk.SaveSettings(apiUrl, theme);
    document.getElementById('status').textContent = 'Saved! Restart to apply URL change.';
  }
  function back() {
    courtdesk.GoBack();
  }
</script>
</body>
</html>`, p.ThemeName, p.APIURL, p.ThemeName)
}

func init() {
	if runtime.GOOS == "windows" {
		log.SetFlags(0)
	}
}
