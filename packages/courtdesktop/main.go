package main

import (
	"encoding/json"
	"flag"
	"html"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/webview/webview_go"
)

type Profile struct {
	APIURL     string   `json:"apiUrl"`
	ThemeName  string   `json:"themeName"`
	RecentURLs []string `json:"recentUrls,omitempty"`
}

type ConnResult struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

const defaultAPIURL = "http://127.0.0.1:8767"
const defaultTheme = "slate"
const maxRecentURLs = 5

func profilePath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "courtdesk", "profile.json")
}

func normalizeURL(u string) string {
	u = strings.TrimSpace(u)
	u = strings.TrimSuffix(u, "/api")
	u = strings.TrimSuffix(u, "/")
	return u
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
	p.APIURL = normalizeURL(p.APIURL)
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

func checkHealth(baseURL string) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(normalizeURL(baseURL) + "/api/health")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func main() {
	fullscreen := flag.Bool("fullscreen", false, "Full-screen mode")
	flag.Parse()

	profile := loadProfile()

	w := webview.New(!*fullscreen)
	defer w.Destroy()

	w.SetTitle("CourtDesk")
	w.SetSize(1920, 1080, webview.HintNone)

	if *fullscreen {
		w.SetSize(1920, 1080, webview.HintMax)
	}

	a := &jsAPI{profile: profile, w: w, done: make(chan struct{})}
	if err := w.Bind("courtdesk", a); err != nil {
		showError("CourtDesk", "Не удалось инициализировать приложение: "+err.Error())
		os.Exit(1)
	}

	if checkHealth(profile.APIURL) {
		a.goApp(profile.APIURL)
	} else {
		a.showConnect("Сервер недоступен. Укажите адрес сервера.", false)
	}

	go a.watch()
	go hotkeysLoop(a)
	w.Run()
	close(a.done)
}

type jsAPI struct {
	mu      sync.Mutex
	profile *Profile
	w       webview.WebView
	mode    string
	fails   int
	done    chan struct{}
}

func (a *jsAPI) GetSettings() Profile {
	a.mu.Lock()
	defer a.mu.Unlock()
	return *a.profile
}

func (a *jsAPI) SaveSettings(apiURL, themeName string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.profile.APIURL = normalizeURL(apiURL)
	if themeName != "" {
		a.profile.ThemeName = themeName
	}
	a.pushRecentLocked(a.profile.APIURL)
	_ = saveProfile(a.profile)
}

func (a *jsAPI) TestConnection(rawURL string) ConnResult {
	url := normalizeURL(rawURL)
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		return ConnResult{Error: "URL должен начинаться с http:// или https://"}
	}
	if checkHealth(url) {
		return ConnResult{OK: true}
	}
	return ConnResult{Error: "Сервер недоступен"}
}

func (a *jsAPI) Connect(rawURL string) {
	url := normalizeURL(rawURL)
	a.mu.Lock()
	a.profile.APIURL = url
	a.pushRecentLocked(url)
	_ = saveProfile(a.profile)
	a.mu.Unlock()
	a.goApp(url)
}

func (a *jsAPI) OpenSettings() {
	a.showSettings()
}

func (a *jsAPI) GoBack() {
	a.mu.Lock()
	url := a.profile.APIURL
	a.mu.Unlock()
	if checkHealth(url) {
		a.goApp(url)
	} else {
		a.showConnect("Сервер недоступен", false)
	}
}

func (a *jsAPI) pushRecentLocked(url string) {
	recent := []string{url}
	for _, u := range a.profile.RecentURLs {
		if u != url {
			recent = append(recent, u)
		}
	}
	if len(recent) > maxRecentURLs {
		recent = recent[:maxRecentURLs]
	}
	a.profile.RecentURLs = recent
}

func (a *jsAPI) goApp(url string) {
	a.mu.Lock()
	a.mode = "app"
	a.fails = 0
	a.mu.Unlock()
	a.w.Navigate(url)
}

func (a *jsAPI) showSettings() {
	a.mu.Lock()
	a.mode = "settings"
	p := *a.profile
	a.mu.Unlock()
	a.w.SetHtml(settingsPage(&p))
}

func (a *jsAPI) showConnect(msg string, ok bool) {
	a.mu.Lock()
	a.mode = "connect"
	p := *a.profile
	a.mu.Unlock()
	a.w.SetHtml(connectPage(&p, msg, ok))
}

func (a *jsAPI) watch() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.done:
			return
		case <-ticker.C:
			a.tick()
		}
	}
}

func (a *jsAPI) tick() {
	a.mu.Lock()
	url := a.profile.APIURL
	mode := a.mode
	a.mu.Unlock()

	ok := checkHealth(url)

	a.mu.Lock()
	defer a.mu.Unlock()
	switch {
	case mode == "app" && !ok:
		a.fails++
		if a.fails >= 3 {
			a.fails = 0
			a.mode = "connect"
			a.w.Dispatch(func() { a.showConnect("Связь с сервером потеряна", false) })
		}
	case mode == "app" && ok:
		a.fails = 0
	case mode == "connect" && ok:
		a.mode = "app"
		a.fails = 0
		a.w.Dispatch(func() { a.w.Navigate(url) })
	}
}

func (a *jsAPI) onHotkeySettings() {
	a.mu.Lock()
	mode := a.mode
	a.mu.Unlock()
	a.w.Dispatch(func() {
		switch mode {
		case "app":
			a.showSettings()
		case "settings":
			a.GoBack()
		}
	})
}

func pageStyles() string {
	return `
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
  h1 { margin-bottom:8px; font-size:24px; }
  .subtitle { margin-bottom:30px; font-size:14px; opacity:0.7; }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:24px; margin-bottom:20px; max-width:600px; }
  label { display:block; margin-bottom:6px; font-size:14px; opacity:0.8; }
  input, select { width:100%; padding:10px 12px; background:var(--input-bg); color:var(--fg); border:1px solid var(--border); border-radius:8px; font-size:14px; margin-bottom:16px; }
  button { padding:10px 24px; background:var(--primary); color:#000; border:none; border-radius:8px; font-size:14px; cursor:pointer; font-weight:600; margin-right:10px; }
  button:hover { opacity:0.9; }
  button:disabled { opacity:0.5; cursor:default; }
  button.secondary { background:var(--surface); color:var(--fg); border:1px solid var(--border); }
  .status { margin-top:12px; font-size:13px; opacity:0.7; }
  .status.ok { opacity:1; color:var(--primary); }
  .status.err { opacity:1; color:#ef4444; }
  ul.recent { list-style:none; max-width:600px; }
  ul.recent li { padding:8px 12px; border:1px solid var(--border); border-radius:8px; margin-bottom:8px; cursor:pointer; font-size:14px; }
  ul.recent li:hover { border-color:var(--primary); }
  .hint { margin-top:24px; font-size:12px; opacity:0.5; max-width:600px; }
`
}

func themeOptions(selected string) string {
	opts := []struct{ value, label string }{
		{"slate", "Slate (Dark)"},
		{"light", "Light"},
		{"paper", "Paper"},
		{"forest", "Forest"},
		{"contrast", "High Contrast"},
	}
	var b strings.Builder
	for _, o := range opts {
		sel := ""
		if o.value == selected {
			sel = " selected"
		}
		b.WriteString(`<option value="` + o.value + `"` + sel + `>` + o.label + `</option>`)
	}
	return b.String()
}

func settingsPage(p *Profile) string {
	apiURL := html.EscapeString(p.APIURL)
	theme := html.EscapeString(p.ThemeName)
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>CourtDesk — Настройки</title>
<style>` + pageStyles() + `</style>
</head>
<body data-theme="` + theme + `">
<h1>Настройки</h1>
<div class="subtitle">CourtDesk</div>
<div class="card">
  <label>Адрес сервера</label>
  <input id="apiUrl" value="` + apiURL + `" placeholder="http://127.0.0.1:8767">
  <label>Тема</label>
  <select id="theme">` + themeOptions(p.ThemeName) + `</select>
  <button onclick="saveConnect()">Сохранить и подключиться</button>
  <button class="secondary" onclick="test()">Проверить</button>
  <button class="secondary" onclick="back()">Назад</button>
  <div class="status" id="status"></div>
</div>
<div class="hint">Ctrl+, — открыть/закрыть настройки.</div>
<script>
  const urlInput = document.getElementById('apiUrl');
  const themeSelect = document.getElementById('theme');
  const status = document.getElementById('status');
  themeSelect.addEventListener('change', function() {
    document.body.setAttribute('data-theme', this.value);
  });
  async function test() {
    status.textContent = 'Проверка…';
    status.className = 'status';
    const r = await courtdesk.TestConnection(urlInput.value);
    if (r.ok) {
      status.textContent = 'Сервер доступен';
      status.className = 'status ok';
    } else {
      status.textContent = r.error;
      status.className = 'status err';
    }
    return r.ok;
  }
  async function saveConnect() {
    await courtdesk.SaveSettings(urlInput.value, themeSelect.value);
    if (await test()) {
      courtdesk.Connect(urlInput.value);
    }
  }
  function back() {
    courtdesk.GoBack();
  }
</script>
</body>
</html>`
}

func connectPage(p *Profile, msg string, ok bool) string {
	apiURL := html.EscapeString(p.APIURL)
	theme := html.EscapeString(p.ThemeName)
	statusClass := "status err"
	if ok {
		statusClass = "status ok"
	}
	var recent strings.Builder
	for _, u := range p.RecentURLs {
		eu := html.EscapeString(u)
		recent.WriteString(`<li data-url="` + eu + `">` + eu + `</li>`)
	}
	recentBlock := ""
	if recent.Len() > 0 {
		recentBlock = `<label>Недавние серверы</label><ul class="recent" id="recent">` + recent.String() + `</ul>`
	}
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>CourtDesk — Подключение</title>
<style>` + pageStyles() + `</style>
</head>
<body data-theme="` + theme + `">
<h1>Подключение к серверу</h1>
<div class="subtitle">CourtDesk</div>
<div class="card">
  <div class="` + statusClass + `" id="status">` + html.EscapeString(msg) + `</div>
  <label style="margin-top:16px">Адрес сервера</label>
  <input id="apiUrl" value="` + apiURL + `" placeholder="http://127.0.0.1:8767">
  <button onclick="connect()">Подключиться</button>
  <button class="secondary" onclick="test()">Проверить</button>
</div>
<div class="card" id="recentCard" style="display:none">` + recentBlock + `</div>
<div class="hint">Если сервер запущен на этом компьютере, убедитесь, что выполнена команда: npm start</div>
<script>
  const urlInput = document.getElementById('apiUrl');
  const status = document.getElementById('status');
  const recentCard = document.getElementById('recentCard');
  if (document.getElementById('recent')) {
    recentCard.style.display = '';
    document.getElementById('recent').addEventListener('click', function(e) {
      const li = e.target.closest('li');
      if (li) {
        urlInput.value = li.dataset.url;
        connect();
      }
    });
  }
  async function test() {
    status.textContent = 'Проверка…';
    status.className = 'status';
    const r = await courtdesk.TestConnection(urlInput.value);
    if (r.ok) {
      status.textContent = 'Сервер доступен';
      status.className = 'status ok';
    } else {
      status.textContent = r.error;
      status.className = 'status err';
    }
    return r.ok;
  }
  async function connect() {
    if (await test()) {
      courtdesk.Connect(urlInput.value);
    }
  }
</script>
</body>
</html>`
}
