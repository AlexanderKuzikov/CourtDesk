# CourtDesk Desktop App

## Overview

Нативное десктопное приложение на Go+WebView, использующее существующий Web UI через WebView2.

## Architecture

```
┌─────────────────────────────────────┐
│   CourtDesk Desktop (Go + WebView)  │
│   ┌───────────────────────────────┐ │
│   │  WebView Window (1920x1080)   │ │
│   │  ┌─────────────────────────┐  │ │
│   │  │  http://127.0.0.1:8767  │  │ │  ← Node.js API + Web UI
│   │  │  (same as browser)      │  │ │
│   │  └─────────────────────────┘  │ │
│   └───────────────────────────────┘ │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Node.js API Server (:8767)        │
│   - Express 5                       │
│   - Puppeteer + RuCaptcha           │
│   - 25 REST endpoints               │
│   - 94 tests                        │
└─────────────────────────────────────┘
```

## Key Features

- **Минимальный бинарник**: 6 MB (WebView2 runtime встроен в Windows 10/11)
- **Нативный рендеринг**: Edge Chromium на Windows, WebKitGTK на Linux, WKWebView на macOS
- **Полный Web UI**: Dashboard, Terminal, Search, Skins — всё из коробки
- **Настраиваемый сервер**: поддержка удалённых API серверов, список недавних серверов
- **Подключение при старте**: health-check → приложение или встроенная страница подключения (не зависит от сервера)
- **Контроль связи**: watcher каждые 10 с; при 3 сбоях подряд — страница подключения, при восстановлении — автовозврат
- **Горячие клавиши**: `Ctrl+,` — настройки (Windows), `F5` — refresh

## File Structure

```
packages/courtdesktop/
├── main.go              # WebView implementation (~200 строк)
├── go.mod               # Dependencies (webview_go)
├── go.sum               # Dependency checksums
├── courtdesktop.exe     # Windows binary (6 MB)
└── IMPLEMENTATION.md    # This file
```

## Usage

### Запуск

```bash
# 1. Запустить API сервер
cd packages/api
npm start

# 2. Запустить desktop app
cd packages/courtdesktop
./courtdesktop.exe              # Normal mode
./courtdesktop.exe -fullscreen  # Fullscreen mode
```

### Настройки

**Ctrl+,** — открыть/закрыть страницу настроек:
- **API URL** — адрес сервера (по умолчанию `http://127.0.0.1:8767`)
- **Theme** — выбор темы (Slate/Light/Paper/Forest/Contrast)
- Настройки сохраняются в `~/.config/courtdesk/profile.json`
- «Сохранить и подключиться» применяет URL без перезапуска

### Если сервер недоступен

При старте выполняется health-check (`GET /api/health`, таймаут 2 с). Если сервер
недоступен, открывается встроенная страница подключения: поле адреса, кнопка
«Проверить», список недавних серверов. Страница встроена в бинарник (SetHtml)
и не зависит от сервера.

Во время работы watcher каждые 10 с проверяет связь; после 3 сбоев подряд
открывается страница подключения («Связь с сервером потеряна»), при
восстановлении доступности приложение возвращается автоматически.

## Technical Details

- **Библиотека**: `github.com/webview/webview_go` (Go bindings для webview C library)
- **WebView2**: Edge Chromium runtime (встроен в Windows 10/11)
- **Bindings**: `courtdesk.GetSettings()`, `courtdesk.SaveSettings()`, `courtdesk.TestConnection()`, `courtdesk.Connect()`, `courtdesk.OpenSettings()`, `courtdesk.GoBack()`
- **Профиль**: JSON в `~/.config/courtdesk/profile.json` (`apiUrl`, `themeName`, `recentUrls`)
- **Горячие клавиши**: `GetAsyncKeyState`-поллинг (Windows), build tag `//go:build windows`

### API URL normalization

При загрузке профиля URL нормализуется:
- Удаляется trailing `/api`
- Удаляется trailing `/`

Это позволяет использовать как `http://server:8767`, так и `http://server:8767/api`.

## Cross-Platform Support

| Platform | WebView Engine | System Dependency |
|----------|----------------|-------------------|
| Windows  | WebView2 (Edge Chromium) | Built-in (Win10/11) |
| Linux    | WebKitGTK | `libwebkit2gtk-4.0` (usually pre-installed) |
| macOS    | WKWebView | Built-in |

### Linux Build

```bash
# Install dependencies
sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev golang

# Build
go build -o courtdesktop .
```

### Cross-compile from Windows

Cross-compile с Windows на Linux требует CGo toolchain и Linux-заголовков. Рекомендуется собирать на целевой платформе.

## Преимущества перед Fyne

| Метрика | Fyne | WebView |
|---------|------|---------|
| Размер бинарника | 40 MB | 6 MB |
| Рендеринг | Custom (OpenGL) | Нативный браузер |
| Код UI | Дублирование | Переиспользование Web UI |
| Поддержка | Ограниченная | Полная (HTML/CSS/JS) |
| Производительность | Средняя | Высокая (GPU-accelerated) |

## История миграции

**v0.6.0** — Desktop app на Fyne (40 MB). Проблемы:
- Большой бинарник (OpenGL, GLFW, fonts)
- Ограниченный UI (Fyne widgets)
- Дублирование кода с Web UI
- Проблемы с Linux cross-compile

**v0.7.0** — Миграция на WebView (6 MB):
- Нативный браузерный движок
- 100% переиспользование Web UI
- Настраиваемый API URL
- Простая кроссплатформенная сборка

## Синхронизация Web ↔ Desktop

Оба интерфейса используют **один и тот же Web UI**:
- Web: `npm start` → открыть `http://127.0.0.1:8767` в браузере
- Desktop: `courtdesktop.exe` → WebView на тот же сервер

Изменения в `packages/viewer/public/` автоматически доступны в обоих интерфейсах.
