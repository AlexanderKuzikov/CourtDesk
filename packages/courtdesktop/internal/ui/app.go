package ui

import (
	"image/color"
	"strconv"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/model"
)

var statusRU = map[string]string{
	"waiting":    "Ожидание",
	"monitoring": "Мониторинг",
	"decision":   "Решение",
	"enforced":   "Вступило",
	"archived":   "Архив",
	"error":      "Ошибка",
}

var statusColors = map[string]color.NRGBA{
	"monitoring": {0x1e, 0x3a, 0x5f, 0xff}, // синий фон
	"waiting":    {0x3a, 0x2a, 0x1a, 0xff}, // жёлтый фон
	"decision":   {0x1a, 0x3a, 0x1a, 0xff}, // зелёный фон
	"enforced":   {0x2a, 0x1a, 0x3a, 0xff}, // фиолетовый фон
	"error":      {0x3a, 0x1a, 0x1a, 0xff}, // красный фон
	"archived":   {0x1e, 0x29, 0x3b, 0xff}, // серый фон
}

// DarkTheme — тёмная тема с максимальной читаемостью
type DarkTheme struct{}

func (t DarkTheme) Color(name fyne.ThemeColorName, variant fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return color.NRGBA{R: 0x0a, G: 0x0e, B: 0x14, A: 0xff} // #0a0e14 — угольно-чёрный
	case theme.ColorNameButton:
		return color.NRGBA{R: 0x1c, G: 0x23, B: 0x2e, A: 0xff} // #1c232e
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 0x52, G: 0xbe, B: 0xf8, A: 0xff} // ярко-голубой
	case theme.ColorNameForeground:
		return color.NRGBA{R: 0xff, G: 0xff, B: 0xff, A: 0xff} // чисто-белый
	case theme.ColorNameInputBackground:
		return color.NRGBA{R: 0x0d, G: 0x11, B: 0x17, A: 0xff} // #0d1117
	case theme.ColorNameInputBorder:
		return color.NRGBA{R: 0x30, G: 0x3b, B: 0x4a, A: 0xff} // #303b4a
	case theme.ColorNameDisabled:
		return color.NRGBA{R: 0x3d, G: 0x4d, B: 0x5c, A: 0xff}
	case theme.ColorNamePlaceHolder:
		return color.NRGBA{R: 0x8b, G: 0x94, B: 0x9e, A: 0xff}
	case theme.ColorNameScrollBar:
		return color.NRGBA{R: 0x2e, G: 0x3a, B: 0x46, A: 0xff}
	case theme.ColorNameShadow:
		return color.NRGBA{R: 0x00, G: 0x00, B: 0x00, A: 0x55}
	case theme.ColorNameHover:
		return color.NRGBA{R: 0x2a, G: 0x34, B: 0x44, A: 0xff}
	case theme.ColorNameSelection:
		return color.NRGBA{R: 0x1a, G: 0x5c, B: 0x8a, A: 0xff}
	}
	return theme.DefaultTheme().Color(name, variant)
}

func (t DarkTheme) Font(style fyne.TextStyle) fyne.Resource {
	return theme.DefaultTheme().Font(style)
}
func (t DarkTheme) Icon(name fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(name)
}
func (t DarkTheme) Size(name fyne.ThemeSizeName) float32 {
	return theme.DefaultTheme().Size(name)
}

func statusBgColor(status string) color.Color {
	if c, ok := statusColors[status]; ok {
		return c
	}
	return color.NRGBA{0x1e, 0x29, 0x3b, 0xff}
}

func statusText(s string) string {
	if r, ok := statusRU[s]; ok {
		return r
	}
	return s
}

// NewStatusBadge создаёт цветную метку статуса
func NewStatusBadge(status string) *fyne.Container {
	t := statusText(status)
	rect := canvas.NewRectangle(statusBgColor(status))
	rect.CornerRadius = 4
	l := widget.NewLabel(" " + t + " ")
	return container.NewMax(rect, l)
}

// NewSectionCard создаёт карточку с заголовком и содержимым
func NewSectionCard(title string, content fyne.CanvasObject) *fyne.Container {
	header := widget.NewLabelWithStyle(title, fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	card := container.NewVBox(
		header,
		widget.NewSeparator(),
		content,
	)
	rect := canvas.NewRectangle(color.NRGBA{0x13, 0x19, 0x22, 0xff})
	rect.CornerRadius = 8
	return container.NewMax(rect, container.NewPadded(card))
}

// makeCounterCard создаёт ячейку счётчика
func makeCounterCard(title string, v *widget.Label) fyne.CanvasObject {
	return container.NewVBox(
		container.NewCenter(v),
		container.NewCenter(widget.NewLabel(title)),
	)
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
	a.Settings().SetTheme(&DarkTheme{})
	w := a.NewWindow("CourtDesk 🏛️")
	w.Resize(fyne.NewSize(1200, 800))
	w.CenterOnScreen()

	profile := model.LoadProfile()

	tabs := container.NewAppTabs(
		container.NewTabItem("Дела", NewDashboardScreen(w)),
		container.NewTabItem("Поиск", NewSearchScreen(w)),
		container.NewTabItem("Настройки", NewSettingsScreen(w)),
	)

	if profile.Role == "admin" {
		tabs.Append(container.NewTabItem("Админ", newAdminScreen(w)))
	}

	w.SetContent(tabs)
	return w
}

func Run() {
	w := NewMainWindow()
	w.ShowAndRun()
}

func newAdminScreen(_ fyne.Window) fyne.CanvasObject {
	return container.NewCenter(container.NewVBox(
		widget.NewLabelWithStyle("Админ-панель", fyne.TextAlignCenter, fyne.TextStyle{Bold: true}),
		NewNotificationsList(),
	))
}
