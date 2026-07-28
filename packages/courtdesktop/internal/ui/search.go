package ui

import (
	"fmt"
	"sync"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
)

func NewSearchScreen(w fyne.Window) fyne.CanvasObject {
	var (
		mu           sync.Mutex
		results      []client.SearchResult
		courtResults []client.CourtInfo
		mode         = "case"
		courtCode    string
	)

	courtEntry := widget.NewEntry()
	courtEntry.SetPlaceHolder("Введите название суда (мин 2 символа)...")

	selectedCourtLabel := widget.NewLabel("")
	selectedCourtLabel.TextStyle = fyne.TextStyle{Bold: true}

	var clearCourtBtn *widget.Button
	clearCourtBtn = widget.NewButton("✕", func() {
		courtCode = ""
		selectedCourtLabel.SetText("")
		clearCourtBtn.Hide()
	})
	clearCourtBtn.Hide()
	clearCourtBtn.Importance = widget.LowImportance

	courtList := widget.NewList(
		func() int {
			mu.Lock()
			defer mu.Unlock()
			return len(courtResults)
		},
		func() fyne.CanvasObject {
			return container.NewHBox(widget.NewLabel(""), widget.NewLabel(""))
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			mu.Lock()
			if id >= len(courtResults) {
				mu.Unlock()
				return
			}
			c := courtResults[id]
			mu.Unlock()
			box := obj.(*fyne.Container)
			box.Objects[0].(*widget.Label).SetText(c.Code)
			box.Objects[0].(*widget.Label).TextStyle = fyne.TextStyle{Monospace: true}
			box.Objects[1].(*widget.Label).SetText(c.Name)
		},
	)
	courtList.SetItemHeight(0, 28)
	courtList.OnSelected = func(id widget.ListItemID) {
		mu.Lock()
		if id >= len(courtResults) {
			mu.Unlock()
			return
		}
		c := courtResults[id]
		courtCode = c.Code
		mu.Unlock()
		selectedCourtLabel.SetText(fmt.Sprintf("✓ %s — %s", c.Code, c.Name))
		clearCourtBtn.Show()
		courtList.UnselectAll()
	}

	var debounce *time.Timer
	courtEntry.OnChanged = func(s string) {
		if debounce != nil {
			debounce.Stop()
		}
		if len(s) < 2 {
			mu.Lock()
			courtResults = nil
			mu.Unlock()
			courtList.Refresh()
			return
		}
		debounce = time.AfterFunc(300*time.Millisecond, func() {
			courts, err := client.Get[[]client.CourtInfo]("/courts?q=" + s)
			if err != nil || len(courts) == 0 {
				mu.Lock()
				courtResults = nil
				mu.Unlock()
				courtList.Refresh()
				return
			}
			mu.Lock()
			courtResults = courts
			mu.Unlock()
			courtList.Refresh()
		})
	}

	modeSelect := widget.NewSelect([]string{"По номеру", "По участникам", "По УИД"}, func(s string) {
		switch s {
		case "По номеру":
			mode = "case"
		case "По участникам":
			mode = "party"
		case "По УИД":
			mode = "case-uid"
		}
	})
	modeSelect.SetSelected("По номеру")

	numberEntry := widget.NewEntry()
	numberEntry.SetPlaceHolder("Номер дела (2-1234/2026)")

	partyEntry := widget.NewEntry()
	partyEntry.SetPlaceHolder("ФИО ответчика")

	dateFrom := widget.NewEntry()
	dateFrom.SetPlaceHolder("Дата с (ГГГГ-ММ-ДД)")
	dateTo := widget.NewEntry()
	dateTo.SetPlaceHolder("Дата по (ГГГГ-ММ-ДД)")

	uidEntry := widget.NewEntry()
	uidEntry.SetPlaceHolder("УИД дела")

	numPanel := container.NewVBox(numberEntry)
	partyPanel := container.NewVBox(partyEntry, dateFrom, dateTo)
	uidPanel := container.NewVBox(uidEntry)
	partyPanel.Hidden = true
	uidPanel.Hidden = true

	origMode := modeSelect.OnChanged
	modeSelect.OnChanged = func(s string) {
		numPanel.Hidden = true
		partyPanel.Hidden = true
		uidPanel.Hidden = true
		switch s {
		case "По участникам":
			partyPanel.Hidden = false
		case "По УИД":
			uidPanel.Hidden = false
		default:
			mode = "case"
		}
		if origMode != nil {
			origMode(s)
		}
	}

	resultList := widget.NewList(
		func() int {
			mu.Lock()
			defer mu.Unlock()
			return len(results)
		},
		func() fyne.CanvasObject {
			return container.NewHBox(widget.NewLabel(""), widget.NewLabel(""),
				widget.NewLabel(""), widget.NewLabel(""))
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			mu.Lock()
			if id >= len(results) {
				mu.Unlock()
				return
			}
			r := results[id]
			mu.Unlock()
			box := obj.(*fyne.Container)
			box.Objects[0].(*widget.Label).SetText(r.CaseNumber)
			box.Objects[0].(*widget.Label).TextStyle = fyne.TextStyle{Bold: true}
			box.Objects[1].(*widget.Label).SetText(r.CourtType)
			box.Objects[2].(*widget.Label).SetText(stringOr(r.Judge, "—"))
			box.Objects[3].(*widget.Label).SetText(fmtDate(r.LegalForceDate))
		},
	)
	resultList.OnSelected = func(id widget.ListItemID) {
		mu.Lock()
		if id < len(results) {
			r := results[id]
			mu.Unlock()
			showResultDetail(w, r)
		} else {
			mu.Unlock()
		}
		resultList.UnselectAll()
	}

	resultCount := widget.NewLabel("")

	searchBtn := widget.NewButton("🔍 Найти", func() {
		go func() {
			cc := courtCode
			if cc == "" {
				t := courtEntry.Text
				if len(t) >= 8 {
					cc = t[:8]
				}
			}
			if cc == "" {
				dialog.ShowError(fmt.Errorf("Выберите суд:\nвведите название и кликните на результат"), w)
				return
			}

			var path string
			var body any

			switch mode {
			case "case":
				if numberEntry.Text == "" {
					dialog.ShowError(fmt.Errorf("Введите номер дела"), w)
					return
				}
				path = "/search/by-number"
				body = map[string]string{"courtId": cc, "caseNumber": numberEntry.Text}
			case "party":
				if partyEntry.Text == "" {
					dialog.ShowError(fmt.Errorf("Введите ФИО участника"), w)
					return
				}
				path = "/search/by-party"
				body = map[string]string{
					"courtId": cc, "defendant": partyEntry.Text,
					"from": dateFrom.Text, "to": dateTo.Text,
				}
			case "case-uid":
				if uidEntry.Text == "" {
					dialog.ShowError(fmt.Errorf("Введите УИД"), w)
					return
				}
				path = "/search/by-case-uid"
				body = map[string]string{"courtId": cc, "caseUid": uidEntry.Text}
			}

			resp, err := client.Post[client.SearchResponse](path, body)
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
				return
			}
			mu.Lock()
			results = resp.Results
			mu.Unlock()
			resultList.Refresh()
			resultCount.SetText(fmt.Sprintf("Найдено: %d", len(results)))
		}()
	})

	addBtn := widget.NewButton("+ Добавить все", func() {
		mu.Lock()
		toAdd := make([]client.SearchResult, len(results))
		copy(toAdd, results)
		mu.Unlock()
		go func() {
			added := 0
			for _, r := range toAdd {
				if r.CaseURL == "" {
					continue
				}
				_, err := client.Post[any]("/cases?parse=true", map[string]string{
					"url": r.CaseURL, "courtId": r.CourtID,
					"courtCode": r.CourtCode, "courtType": r.CourtType,
					"caseNumber": r.CaseNumber,
				})
				if err == nil {
					added++
				}
			}
			dialog.ShowInformation("Готово", fmt.Sprintf("Добавлено: %d/%d", added, len(toAdd)), w)
		}()
	})

	waitParty := widget.NewEntry()
	waitParty.SetPlaceHolder("ФИО стороны")
	waitDate := widget.NewEntry()
	waitDate.SetPlaceHolder("Дата (ГГГГ-ММ-ДД)")
	waitBtn := widget.NewButton("⏳ Следить", func() {
		cc := courtCode
		party := waitParty.Text
		date := waitDate.Text
		if cc == "" {
			dialog.ShowError(fmt.Errorf("Укажите суд"), w)
			return
		}
		if party == "" {
			dialog.ShowError(fmt.Errorf("Введите сторону"), w)
			return
		}
		go func() {
			_, err := client.Post[any]("/cases/wait", map[string]string{
				"courtId": cc, "courtType": "district",
				"party": party, "filingDate": date,
			})
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
			} else {
				dialog.ShowInformation("Готово", "Отслеживание добавлено", w)
			}
		}()
	})

	courtSelector := container.NewVBox(
		widget.NewLabelWithStyle("🏛️ Суд", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		courtEntry,
		container.NewHBox(selectedCourtLabel, clearCourtBtn),
		courtList,
	)

	sidebar := container.NewVBox(
		courtSelector,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("🔍 Режим", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		modeSelect,
		numPanel, partyPanel, uidPanel,
		widget.NewSeparator(),
		searchBtn, addBtn,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("⏳ Отслеживание", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		waitParty, waitDate, waitBtn,
	)

	rightPanel := container.NewBorder(resultCount, nil, nil, nil, resultList)
	split := container.NewHSplit(sidebar, rightPanel)
	split.Offset = 0.35

	return split
}

func showResultDetail(w fyne.Window, r client.SearchResult) {
	body := container.NewVBox()

	addLine(body, fmt.Sprintf("■ %s", r.CaseNumber))
	if r.CaseURL != "" {
		addLine(body, r.CaseURL)
	}
	addSep(body)
	addLine(body, fmt.Sprintf("Тип суда: %s", r.CourtType))
	addLine(body, fmt.Sprintf("Судья: %s", stringOr(r.Judge, "—")))
	addLine(body, fmt.Sprintf("Дата поступления: %s", fmtDate(r.FilingDate)))
	addLine(body, fmt.Sprintf("Дата решения: %s", fmtDate(r.DecisionDate)))
	addLine(body, fmt.Sprintf("Результат: %s", stringOr(r.Result, "—")))
	addLine(body, fmt.Sprintf("Вступление: %s", fmtDate(r.LegalForceDate)))
	if r.CaseUid != "" {
		addSep(body)
		addLine(body, fmt.Sprintf("УИД: %s", r.CaseUid))
	}

	scroll := container.NewVScroll(body)

	addBtn := widget.NewButton("📋 В мониторинг", func() {
		go func() {
			_, err := client.Post[any]("/cases?parse=true", map[string]string{
				"url": r.CaseURL, "courtId": r.CourtID,
				"courtType": r.CourtType, "caseNumber": r.CaseNumber,
			})
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
			} else {
				dialog.ShowInformation("Готово", "Дело добавлено", w)
			}
		}()
	})

	content := container.NewBorder(nil, addBtn, nil, nil, scroll)
	d := dialog.NewCustom("Детали", "Закрыть", content, w)
	d.Resize(fyne.NewSize(560, 480))
	d.Show()
}
