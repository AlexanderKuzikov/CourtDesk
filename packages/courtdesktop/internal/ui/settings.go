package ui

import (
	"fmt"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
)

func NewSettingsScreen(w fyne.Window) fyne.CanvasObject {
	scheduleFull := widget.NewEntry()
	scheduleFull.SetPlaceHolder("03:00")

	retryInterval := widget.NewEntry()
	retryInterval.SetPlaceHolder("3")

	staleHours := widget.NewEntry()
	staleHours.SetPlaceHolder("6")

	autoEnabled := widget.NewCheck("Автоматический мониторинг", nil)

	statusLabel := widget.NewLabel("")

	saveBtn := widget.NewButton("Сохранить", func() {
		s := client.AppSettings{
			ScheduleFull:       scheduleFull.Text,
			RetryIntervalHours: parseInt(retryInterval.Text, 3),
			RetryStaleHours:    parseInt(staleHours.Text, 6),
			ScheduleEnabled:    autoEnabled.Checked,
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

	form := container.NewVBox(
		widget.NewLabelWithStyle("⚙️ Настройки мониторинга", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		widget.NewLabel(""),
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


