package ui

import (
	"fmt"
	"sync"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
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

	body := container.NewVBox()

	// Заголовок — номер дела
	body.Add(widget.NewLabelWithStyle(cs.Number, fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
	if cs.URL != "" {
		body.Add(widget.NewLabel(cs.URL))
	}
	body.Add(widget.NewSeparator())

	// Основная информация — сетка 2 колонки
	info := container.NewGridWithColumns(2)
	addPair(info, "Статус", statusText(cs.Status))
	addPair(info, "Вступление в силу", fmtDate(cs.LegalForceDate))
	addPair(info, "Последняя проверка", fmtDT(cs.LastChecked))
	if cs.CaseUid != "" {
		addPair(info, "УИД", cs.CaseUid)
	}
	body.Add(container.NewPadded(info))
	body.Add(widget.NewSeparator())

	// Суд
	courtName := cs.CourtName
	if courtName == "" && cd != nil {
		courtName = cd.Court
	}
	if courtName != "" || cd != nil {
		body.Add(widget.NewLabelWithStyle("🏛️ Суд", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
		courtInfo := container.NewGridWithColumns(2)
		addPair(courtInfo, "Суд", courtName)
		if cd != nil {
			addPair(courtInfo, "Тип суда", stringOr(cd.CourtType, cs.CourtType))
			addPair(courtInfo, "Тип дела", stringOr(cd.Type, "—"))
			if cd.Card != nil {
				if len(cd.Card.Category) > 0 {
					cat := ""
					for i, c := range cd.Card.Category {
						if i > 0 {
							cat += " → "
						}
						cat += c
					}
					addPair(courtInfo, "Категория", cat)
				}
				addPair(courtInfo, "Судья", stringOr(cd.Card.Judge, "—"))
				addPair(courtInfo, "Дата поступления", fmtDate(cd.Card.FilingDate))
				addPair(courtInfo, "Дата слушания", fmtDate(cd.Card.HearingDate))
				addPair(courtInfo, "Результат", stringOr(cd.Card.Result, "—"))
			}
		} else {
			addPair(courtInfo, "Код", stringOr(cs.CourtCode, cs.CourtID))
		}
		body.Add(container.NewPadded(courtInfo))
		body.Add(widget.NewSeparator())
	}

	// Результат решения
	if cs.Result != "" {
		body.Add(widget.NewLabelWithStyle("📄 Результат", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
		body.Add(container.NewPadded(widget.NewLabel(cs.Result)))
		body.Add(widget.NewSeparator())
	}

	// Участники
	if cd != nil && len(cd.Parties) > 0 {
		pl, de := 0, 0
		for _, p := range cd.Parties {
			switch p.Role {
			case "Истец", "Истец (заявитель)":
				pl++
			case "Ответчик":
				de++
			}
		}
		body.Add(widget.NewLabelWithStyle(fmt.Sprintf("👥 Стороны: %d истец/ов, %d ответчик/ов", pl, de),
			fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
		for _, p := range cd.Parties {
			line := fmt.Sprintf("  %s: %s", p.Role, p.Name)
			if p.INN != "" {
				line += fmt.Sprintf(" (ИНН %s", p.INN)
				if p.OGRN != "" {
					line += fmt.Sprintf(", ОГРН %s", p.OGRN)
				}
				line += ")"
			}
			body.Add(widget.NewLabel(line))
		}
		body.Add(widget.NewSeparator())
	}

	// Движение дела
	if cd != nil && len(cd.Events) > 0 {
		body.Add(widget.NewLabelWithStyle(fmt.Sprintf("📅 Движение дела (%d)", len(cd.Events)),
			fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
		start := 0
		if len(cd.Events) > 20 {
			start = len(cd.Events) - 20
		}
		for i := len(cd.Events) - 1; i >= start; i-- {
			e := cd.Events[i]
			txt := fmt.Sprintf("  • %s", e.EventDate)
			if e.EventTime != "" {
				txt += " " + e.EventTime
			}
			txt += " — " + e.EventName
			if e.Result != "" {
				txt += ": " + e.Result
			}
			body.Add(widget.NewLabel(txt))
		}
		if len(cd.Events) > 20 {
			body.Add(widget.NewLabel(fmt.Sprintf("  ... и ещё %d", len(cd.Events)-20)))
		}
		body.Add(widget.NewSeparator())
	}

	// Ошибка
	if cs.LastError != "" {
		body.Add(widget.NewLabelWithStyle(fmt.Sprintf("❌ Ошибок: %d", cs.ErrorCount),
			fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
		body.Add(container.NewPadded(widget.NewLabel(cs.LastError)))
		body.Add(widget.NewSeparator())
	}

	// История мониторинга
	if len(ev) > 0 {
		body.Add(widget.NewLabelWithStyle("📋 История мониторинга",
			fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
		for _, e := range ev {
			body.Add(container.NewPadded(widget.NewLabel(fmt.Sprintf("%s %s — %s",
				eventIcon(e.Type), fmtDT(e.CreatedAt), e.Message))))
		}
	}

	body.Add(layout.NewSpacer())
	scroll := container.NewVScroll(body)

	// Кнопки
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
	unarchiveBtn := widget.NewButton("↩ Вернуть из архива", func() {
		go func() {
			_, err := client.Patch[any]("/cases/"+uid, map[string]string{"status": "monitoring"})
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
			} else {
				dialog.ShowInformation("Готово", "Дело возвращено в мониторинг", w)
			}
		}()
	})
	deleteBtn := widget.NewButton("🗑 Удалить", func() {
		dialog.ShowConfirm("Удаление", "Удалить дело безвозвратно?", func(ok bool) {
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

	content := container.NewBorder(nil, actionBox, nil, nil, scroll)
	d := dialog.NewCustom("Дело "+cs.Number, "✕ Закрыть", content, w)
	d.Resize(fyne.NewSize(680, 600))
	d.Show()
}

func addPair(g *fyne.Container, key, val string) {
	if val == "" {
		val = "—"
	}
	g.Add(widget.NewLabelWithStyle(key+":", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
	g.Add(widget.NewLabel(val))
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
