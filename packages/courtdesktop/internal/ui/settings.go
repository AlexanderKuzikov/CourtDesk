package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/model"
)

func NewSettingsScreen(w fyne.Window) fyne.CanvasObject {
	apiURLEntry := widget.NewEntry()
	apiURLEntry.SetPlaceHolder("http://127.0.0.1:8767/api")

	scheduleFull := widget.NewEntry()
	scheduleFull.SetPlaceHolder("03:00")

	retryInterval := widget.NewEntry()
	retryInterval.SetPlaceHolder("3")

	staleHours := widget.NewEntry()
	staleHours.SetPlaceHolder("6")

	autoEnabled := widget.NewCheck("Автоматический мониторинг", nil)

	statusLabel := widget.NewLabel("")

	profile := model.LoadProfile()

	themeNames := make([]string, len(Themes))
	for i, t := range Themes {
		themeNames[i] = t.Name
	}
	themeSelect := widget.NewSelect(themeNames, func(name string) {
		ApplyTheme(name)
		profile.ThemeName = name
		_ = profile.Save()
	})
	themeSelect.SetSelected(profile.ThemeName)

	saveBtn := widget.NewButton("Сохранить", func() {
		newURL := apiURLEntry.Text
		if newURL == "" {
			newURL = profile.APIURL
		}

		s := client.AppSettings{
			ScheduleFull:       scheduleFull.Text,
			RetryIntervalHours: parseInt(retryInterval.Text, 3),
			RetryStaleHours:    parseInt(staleHours.Text, 6),
			ScheduleEnabled:    autoEnabled.Checked,
		}

		if newURL != profile.APIURL {
			profile.APIURL = newURL
			if err := profile.Save(); err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка сохранения профиля: %w", err), w)
				return
			}
			client.Init(newURL)
		}

		go func() {
			_, err := client.Put[client.AppSettings]("/settings", s)
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка сохранения: %w", err), w)
				statusLabel.SetText("✗ Ошибка")
			} else {
				statusLabel.SetText("✓ Настройки сохранены")
			}
		}()
	})

	apiURLEntry.SetText(profile.APIURL)

	form := container.NewVBox(
		widget.NewLabelWithStyle("🎨 Оформление", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewLabel("Тема:"),
		themeSelect,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("🔗 Подключение", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewLabel("API URL:"),
		apiURLEntry,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("⚙️ Мониторинг", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewLabel("Время полного прогона (HH:MM):"),
		scheduleFull,
		widget.NewLabel("Retry каждые (часов):"),
		retryInterval,
		widget.NewLabel("Stale старше (часов):"),
		staleHours,
		autoEnabled,
		widget.NewSeparator(),
		saveBtn,
		statusLabel,
	)

	go func() {
		s, err := client.Get[client.AppSettings]("/settings")
		if err != nil {
			return
		}
		scheduleFull.SetText(s.ScheduleFull)
		retryInterval.SetText(fmt.Sprintf("%d", s.RetryIntervalHours))
		staleHours.SetText(fmt.Sprintf("%d", s.RetryStaleHours))
		autoEnabled.SetChecked(s.ScheduleEnabled)
	}()

	return container.NewBorder(nil, nil, nil, nil,
		container.NewCenter(container.NewVBox(
			widget.NewLabel(""),
			form,
		)),
	)
}
