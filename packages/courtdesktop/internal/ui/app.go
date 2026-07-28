package ui

import (
	"fmt"
	"strconv"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/model"
)

var (
	currentApp  fyne.App
	currentTabs *container.AppTabs
)

var statusRU = map[string]string{
	"waiting":    "Ожидание",
	"monitoring": "Мониторинг",
	"decision":   "Решение",
	"enforced":   "Вступило",
	"archived":   "Архив",
	"error":      "Ошибка",
}

func ApplyTheme(name string) {
	td := ThemeByName(name)
	if currentApp != nil {
		currentApp.Settings().SetTheme(td.Theme)
	}
}

func statusText(s string) string {
	if r, ok := statusRU[s]; ok {
		return r
	}
	return s
}

func fmtDate(iso string) string {
	if iso == "" {
		return "—"
	}
	if len(iso) >= 10 {
		return iso[:10]
	}
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return iso
	}
	return t.Format("02.01.2006")
}

func fmtDT(iso string) string {
	if iso == "" {
		return "—"
	}
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return iso
	}
	return t.Format("02.01.2006 15:04")
}

func stringOr(s ...string) string {
	for _, v := range s {
		if v != "" {
			return v
		}
	}
	return "—"
}

func parseInt(s string, def int) int {
	if s == "" {
		return def
	}
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}

func NewMainWindow() fyne.Window {
	a := app.New()
	currentApp = a

	profile := model.LoadProfile()
	td := ThemeByName(profile.ThemeName)
	a.Settings().SetTheme(td.Theme)

	w := a.NewWindow("CourtDesk")
	w.Resize(fyne.NewSize(1200, 800))

	checkAPI(w)

	tabs := container.NewAppTabs(
		container.NewTabItem("Дела", NewDashboardScreen(w)),
		container.NewTabItem("Поиск", NewSearchScreen(w)),
		container.NewTabItem("Настройки", NewSettingsScreen(w)),
	)
	tabs.SetTabLocation(container.TabLocationTop)
	currentTabs = tabs

	w.SetContent(tabs)

	w.Canvas().SetOnTypedKey(func(k *fyne.KeyEvent) {
		switch k.Name {
		case fyne.KeyLeft:
			idx := tabs.SelectedIndex()
			if idx > 0 {
				tabs.SelectIndex(idx - 1)
			}
		case fyne.KeyRight:
			idx := tabs.SelectedIndex()
			if idx < len(tabs.Items)-1 {
				tabs.SelectIndex(idx + 1)
			}
		case fyne.KeyF5:
			if triggerRefresh != nil {
				triggerRefresh()
			}
		}
	})

	return w
}

var triggerRefresh func()

func checkAPI(w fyne.Window) {
	go func() {
		err := client.HealthCheck()
		if err != nil {
			dialog.ShowError(fmt.Errorf("CourtDesk API недоступен.\n\nЗапустите сервер:\n  cd CourtDesk && npm start\n\n%w", err), w)
		}
	}()
}

func Run() {
	w := NewMainWindow()
	w.ShowAndRun()
}
