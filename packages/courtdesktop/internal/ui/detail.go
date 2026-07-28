package ui

import (
	"fmt"
	"sync"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
)

func showDetail(w fyne.Window, uid string) {
	var (
		mu     sync.Mutex
		c      client.WatchedCase
		events []client.CaseEvent
		card   *client.CaseCard
	)

	progress := widget.NewProgressBarInfinite()
	loading := dialog.NewCustom("Загрузка...", "", container.NewVBox(progress), w)
	loading.Show()

	var wg sync.WaitGroup
	wg.Add(3)

	go func() {
		defer wg.Done()
		cs, err := client.Get[client.WatchedCase]("/cases/" + uid)
		if err == nil {
			mu.Lock()
			c = cs
			mu.Unlock()
		}
	}()
	go func() {
		defer wg.Done()
		ev, err := client.Get[[]client.CaseEvent]("/cases/" + uid + "/events")
		if err == nil {
			mu.Lock()
			events = ev
			mu.Unlock()
		}
	}()
	go func() {
		defer wg.Done()
		cd, err := client.Get[client.CaseCard]("/cases/" + uid + "/card")
		if err == nil {
			mu.Lock()
			card = &cd
			mu.Unlock()
		}
	}()
	wg.Wait()
	loading.Hide()

	mu.Lock()
	cs, ev, cd := c, events, card
	mu.Unlock()

	mainContent := buildMainSection(cs)
	courtContent := buildCourtSection(cs, cd)
	partiesContent := buildPartiesSection(cd)
	movContent := buildMovementSection(cd)
	monContent := buildMonitorSection(cs, ev)

	acc := widget.NewAccordion(
		widget.NewAccordionItem("Основное", mainContent),
		widget.NewAccordionItem("Суд и дело", courtContent),
		widget.NewAccordionItem("Стороны", partiesContent),
		widget.NewAccordionItem("Движение дела", movContent),
		widget.NewAccordionItem("Мониторинг", monContent),
	)
	acc.Open(0)

	archiveBtn := widget.NewButton("📦 В архив", func() {
		go func() {
			_, err := client.Patch[any]("/cases/"+uid, map[string]string{"status": "archived"})
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
			} else {
				dialog.ShowInformation("Готово", "Дело заархивировано", w)
			}
		}()
	})
	unarchiveBtn := widget.NewButton("↩ Вернуть", func() {
		go func() {
			_, err := client.Patch[any]("/cases/"+uid, map[string]string{"status": "monitoring"})
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
			} else {
				dialog.ShowInformation("Готово", "Дело возвращено", w)
			}
		}()
	})
	deleteBtn := widget.NewButton("🗑 Удалить", func() {
		dialog.ShowConfirm("Удаление", "Удалить дело?", func(ok bool) {
			if !ok {
				return
			}
			go func() {
				err := client.Delete("/cases/" + uid)
				if err != nil {
					dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
				} else {
					dialog.ShowInformation("Готово", "Дело удалено", w)
				}
			}()
		}, w)
	})
	deleteBtn.Importance = widget.DangerImportance

	actionBox := container.NewHBox()
	if cs.Status == "archived" {
		actionBox.Add(unarchiveBtn)
	} else {
		actionBox.Add(archiveBtn)
	}
	actionBox.Add(deleteBtn)

	content := container.NewBorder(nil, actionBox, nil, nil, container.NewVScroll(acc))
	d := dialog.NewCustom("Дело №"+cs.Number, "Закрыть", content, w)
	d.Resize(fyne.NewSize(700, 600))
	d.Show()
}

func buildMainSection(cs client.WatchedCase) fyne.CanvasObject {
	body := container.NewVBox()

	grid := container.NewGridWithColumns(2,
		widget.NewLabel("Статус:"), widget.NewLabel(statusText(cs.Status)),
		widget.NewLabel("Вступление:"), widget.NewLabel(fmtDate(cs.LegalForceDate)),
		widget.NewLabel("Последняя проверка:"), widget.NewLabel(fmtDT(cs.LastChecked)),
		widget.NewLabel("Создано:"), widget.NewLabel(fmtDT(cs.CreatedAt)),
		widget.NewLabel("Обновлено:"), widget.NewLabel(fmtDT(cs.UpdatedAt)),
	)
	body.Add(grid)

	if cs.CaseUid != "" {
		addSep(body)
		body.Add(container.NewGridWithColumns(2,
			widget.NewLabel("УИД:"), widget.NewLabel(cs.CaseUid),
		))
	}
	if cs.URL != "" {
		addSep(body)
		body.Add(container.NewGridWithColumns(2,
			widget.NewLabel("URL:"), widget.NewLabel(cs.URL),
		))
	}
	if cs.Result != "" {
		addSep(body)
		body.Add(container.NewGridWithColumns(2,
			widget.NewLabel("Результат:"), widget.NewLabel(cs.Result),
		))
	}
	if cs.ErrorCount > 0 {
		addSep(body)
		body.Add(container.NewGridWithColumns(2,
			widget.NewLabel("Ошибок:"), widget.NewLabel(fmt.Sprintf("%d", cs.ErrorCount)),
			widget.NewLabel(""), widget.NewLabel(cs.LastError),
		))
	}
	return body
}

func buildCourtSection(cs client.WatchedCase, cd *client.CaseCard) fyne.CanvasObject {
	body := container.NewVBox()

	courtName := cs.CourtName
	if courtName == "" && cd != nil {
		courtName = cd.Court
	}
	grid := container.NewGridWithColumns(2,
		widget.NewLabel("Суд:"), widget.NewLabel(stringOr(courtName, "—")),
		widget.NewLabel("Код:"), widget.NewLabel(stringOr(cs.CourtCode, cs.CourtID)),
		widget.NewLabel("Тип суда:"), widget.NewLabel(stringOr(cs.CourtType, "—")),
	)
	body.Add(grid)

	if cd != nil {
		addSep(body)
		rows := []fyne.CanvasObject{
			widget.NewLabel("Тип дела:"), widget.NewLabel(stringOr(cd.Type, "—")),
		}
		if cd.Card != nil {
			if len(cd.Card.Category) > 0 {
				cat := ""
				for i, c := range cd.Card.Category {
					if i > 0 {
						cat += " → "
					}
					cat += c
				}
				rows = append(rows, widget.NewLabel("Категория:"), widget.NewLabel(cat))
			}
			rows = append(rows,
				widget.NewLabel("Судья:"), widget.NewLabel(stringOr(cd.Card.Judge, "—")),
				widget.NewLabel("Поступление:"), widget.NewLabel(fmtDate(cd.Card.FilingDate)),
				widget.NewLabel("Слушание:"), widget.NewLabel(fmtDate(cd.Card.HearingDate)),
				widget.NewLabel("Тип процесса:"), widget.NewLabel(stringOr(cd.Card.ProceedingType, "—")),
				widget.NewLabel("Результат:"), widget.NewLabel(stringOr(cd.Card.Result, "—")),
			)
		}
		body.Add(container.NewGridWithColumns(2, rows...))
	}

	return body
}

func buildPartiesSection(cd *client.CaseCard) fyne.CanvasObject {
	body := container.NewVBox()

	if cd == nil || len(cd.Parties) == 0 {
		body.Add(widget.NewLabel("Нет данных о сторонах"))
		return body
	}

	body.Add(widget.NewLabel(fmt.Sprintf("Стороны (%d)", len(cd.Parties))))
	addSep(body)
	for _, p := range cd.Parties {
		line := fmt.Sprintf("[%s] %s", p.Role, p.Name)
		if p.INN != "" {
			line += fmt.Sprintf("  (ИНН %s", p.INN)
			if p.OGRN != "" {
				line += fmt.Sprintf(", ОГРН %s", p.OGRN)
			}
			line += ")"
		}
		body.Add(widget.NewLabel(line))
	}

	return body
}

func buildMovementSection(cd *client.CaseCard) fyne.CanvasObject {
	body := container.NewVBox()

	if cd == nil || len(cd.Events) == 0 {
		body.Add(widget.NewLabel("Нет данных о движении дела"))
		return body
	}

	body.Add(widget.NewLabel(fmt.Sprintf("Событий: %d", len(cd.Events))))
	addSep(body)

	start := 0
	if len(cd.Events) > 30 {
		start = len(cd.Events) - 30
	}
	for i := len(cd.Events) - 1; i >= start; i-- {
		e := cd.Events[i]
		header := e.EventDate
		if e.EventTime != "" {
			header += " " + e.EventTime
		}
		body.Add(widget.NewLabel(fmt.Sprintf("▸ %s", header)))
		body.Add(widget.NewLabel(fmt.Sprintf("  %s", e.EventName)))
		if e.Result != "" {
			body.Add(widget.NewLabel(fmt.Sprintf("  → %s", e.Result)))
		}
		if e.Judge != "" {
			body.Add(widget.NewLabel(fmt.Sprintf("  Судья: %s", e.Judge)))
		}
		addSep(body)
	}

	return body
}

func buildMonitorSection(cs client.WatchedCase, ev []client.CaseEvent) fyne.CanvasObject {
	body := container.NewVBox()

	if len(ev) == 0 {
		body.Add(widget.NewLabel("История мониторинга пуста"))
		return body
	}

	body.Add(widget.NewLabel(fmt.Sprintf("Записей: %d", len(ev))))
	addSep(body)
	for _, e := range ev {
		body.Add(widget.NewLabel(fmt.Sprintf("%s %s — %s", eventIcon(e.Type), fmtDT(e.CreatedAt), e.Message)))
	}

	return body
}

func addLine(body *fyne.Container, text string) {
	body.Add(widget.NewLabel(text))
}

func addSep(body *fyne.Container) {
	body.Add(widget.NewSeparator())
}

func eventIcon(typ string) string {
	switch typ {
	case "created":
		return "🆕"
	case "checked":
		return "🔄"
	case "error":
		return "❌"
	case "decision":
		return "⚖️"
	case "enforced":
		return "✅"
	case "deleted":
		return "🗑️"
	default:
		return "•"
	}
}
