# CourtDesk WebView Implementation

## Overview
Successfully migrated CourtDesk from Fyne to WebView, reducing binary size from ~40MB to ~13MB while providing native browser rendering of the existing Web UI.

## Architecture
- **Backend**: Node.js API server (unchanged) at `http://127.0.0.1:8767`
- **Frontend**: WebView window displaying the existing Web UI
- **Configuration**: Profile stored at `~/.config/courtdesk/profile.json`
- **Settings**: Accessible via Ctrl+, keyboard shortcut

## Key Features
1. **Lightweight**: 13MB binary (vs 40MB with Fyne)
2. **Native Rendering**: Uses system WebView (Edge WebView2 on Windows, WebKitGTK on Linux)
3. **Full HD**: 1920x1080 window by default, fullscreen mode available via `-fullscreen` flag
4. **Theme Support**: 5 themes (Slate, Light, Paper, Forest, High Contrast)
5. **Settings Page**: Built-in settings accessible via Ctrl+,

## File Structure
```
packages/courtdesktop/
├── main.go              # WebView implementation (212 lines)
├── go.mod               # Dependencies
├── go.sum               # Dependency checksums
└── courtdesktop.exe     # Windows binary (13MB)
```

## Removed Files
- `internal/ui/*.go` - Fyne UI components (app, dashboard, detail, search, settings, themes)
- `internal/client/*.go` - HTTP client code (no longer needed)
- `internal/model/*.go` - Model code (consolidated into main.go)

## Usage
```bash
# Start API server first
cd packages/api
npm start

# Launch desktop app
cd packages/courtdesktop
./courtdesktop.exe              # Normal mode
./courtdesktop.exe -fullscreen  # Fullscreen mode
```

## Settings
Press `Ctrl+,` to open settings page where you can:
- Change API URL
- Select theme
- Settings persist across sessions

## Technical Details
- Uses `github.com/webview/webview_go` library
- Keyboard shortcut injected via `w.Init()` for settings access
- Profile loaded/saved as JSON
- API health check before launching WebView
- Graceful error handling if API is unavailable

## Cross-Platform Support
- **Windows**: Uses Edge WebView2 (pre-installed on Windows 10/11)
- **Linux**: Uses WebKitGTK (requires libwebkit2gtk-4.0)
- **macOS**: Uses WKWebView (built into macOS)

## Benefits over Fyne
1. **Smaller binary**: 13MB vs 40MB
2. **Better rendering**: Native browser engine vs Fyne's custom renderer
3. **Code reuse**: Uses existing Web UI (no duplication)
4. **Easier maintenance**: Single source of truth for UI
5. **Better performance**: Hardware-accelerated browser rendering
