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
		mu          sync.Mutex
		results     []client.SearchResult
		mode        = "case"
		courtCode   = ""
		resultList  *widget.List
		resultCount *widget.Label
	)

	// ── Court autocomplete ──
	courtEntry := widget.NewEntry()
	courtEntry.SetPlaceHolder("Введите название суда (мин 2 символа)...")
	courtInfo := widget.NewLabel("")
	courtInfo.Wrapping = fyne.TextWrapBreak

	courtResults := widget.NewList(
		func() int { return 0 },
		func() fyne.CanvasObject {
			return container.NewHBox(
				widget.NewLabel(""),
				widget.NewLabel(""),
			)
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {},
	)
	courtResults.Hide()

	courtSuggestions := make([]client.CourtInfo, 0)

	var courtDebounce *time.Timer
	courtEntry.OnChanged = func(s string) {
		if courtDebounce != nil {
			courtDebounce.Stop()
		}
		if len(s) < 2 {
			courtResults.Hide()
			courtInfo.SetText("")
			return
		}
		courtDebounce = time.AfterFunc(300*time.Millisecond, func() {
			courts, err := client.Get[[]client.CourtInfo]("/courts?q=" + s)
			if err != nil {
				return
			}
			courtSuggestions = courts
			if len(courts) == 0 {
				courtResults.Hide()
				return
			}
			courtResults.Length = func() int { return len(courtSuggestions) }
			courtResults.UpdateItem = func(id widget.ListItemID, obj fyne.CanvasObject) {
				if id >= len(courtSuggestions) {
					return
				}
				c := courtSuggestions[id]
				box := obj.(*fyne.Container)
				box.Objects[0].(*widget.Label).SetText(c.Code + " — " + c.Name)
			}
			courtResults.OnSelected = func(id widget.ListItemID) {
				if id < len(courtSuggestions) {
					c := courtSuggestions[id]
					courtCode = c.Code
					courtEntry.SetText(c.Code + " — " + c.Name)
					courtInfo.SetText(fmt.Sprintf("✅ Выбран: %s (%s)", c.Name, c.Code))
					courtResults.Hide()
				}
				courtResults.UnselectAll()
			}
			courtResults.Show()
			courtResults.Refresh()
		})
	}

	courtEntry.OnSubmitted = func(s string) {
		courtResults.Hide()
		if len(s) >= 8 {
			code := s[:8]
			// Verify it's a valid code format (8 chars, alphanumeric)
			isValid := true
			for _, c := range code {
				if !((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
					isValid = false
					break
				}
			}
			if isValid {
				courtCode = code
				courtInfo.SetText(fmt.Sprintf("✅ Код суда: %s", code))
			}
		}
	}

	// ── Mode fields ──
	modeSelect := widget.NewSelect([]string{"По номеру", "По участникам", "По УИД"}, nil)
	modeSelect.SetSelected("По номеру")

	numberEntry := widget.NewEntry()
	numberEntry.SetPlaceHolder("Номер дела (напр. 2-1234/2026)")

	partyEntry := widget.NewEntry()
	partyEntry.SetPlaceHolder("ФИО ответчика / название")

	dateFrom := widget.NewEntry()
	dateFrom.SetPlaceHolder("Дата с (ГГГГ-ММ-ДД)")

	dateTo := widget.NewEntry()
	dateTo.SetPlaceHolder("Дата по (ГГГГ-ММ-ДД)")

	uidEntry := widget.NewEntry()
	uidEntry.SetPlaceHolder("УИД дела (напр. 59RS0007-...)")

	// Mode panels
	numberPanel := container.NewVBox(numberEntry)
	partyPanel := container.NewVBox(partyEntry, dateFrom, dateTo)
	uidPanel := container.NewVBox(uidEntry)
	partyPanel.Hidden = true
	uidPanel.Hidden = true

	modeSelect.OnChanged = func(s string) {
		numberPanel.Hidden = true
		partyPanel.Hidden = true
		uidPanel.Hidden = true
		switch s {
		case "По участникам":
			mode = "party"
			partyPanel.Hidden = false
		case "По УИД":
			mode = "case-uid"
			uidPanel.Hidden = false
		default:
			mode = "case"
			numberPanel.Hidden = false
		}
	}

	// ── Search button ──
	searchBtn := widget.NewButton("🔍 Найти", func() {
		go func() {
			cc := courtCode
			if cc == "" {
				dialog.ShowError(fmt.Errorf("Укажите суд\n1) Начните вводить название в поле\n2) Выберите из выпадающего списка"), w)
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
					"courtId":   cc,
					"defendant": partyEntry.Text,
					"from":      dateFrom.Text,
					"to":        dateTo.Text,
				}
			case "case-uid":
				if uidEntry.Text == "" {
					dialog.ShowError(fmt.Errorf("Введите УИД"), w)
					return
				}
				path = "/search/by-case-uid"
				body = map[string]string{"courtId": cc, "caseUid": uidEntry.Text}
			}

			searchResp, err := client.Post[client.SearchResponse](path, body)
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка поиска: %w", err), w)
				return
			}
			mu.Lock()
			results = searchResp.Results
			mu.Unlock()
			resultList.Refresh()
			resultCount.SetText(fmt.Sprintf("Найдено дел: %d", len(results)))
		}()
	})

	// ── Results list ──
	resultCount = widget.NewLabel("")
	resultList = widget.NewList(
		func() int { return len(results) },
		func() fyne.CanvasObject {
			return container.NewHBox(
				widget.NewLabel(""),
				widget.NewLabel(""),
				widget.NewLabel(""),
				widget.NewLabel(""),
			)
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			if id >= len(results) {
				return
			}
			r := results[id]
			box := obj.(*fyne.Container)
			box.Objects[0].(*widget.Label).SetText(r.CaseNumber)
			box.Objects[0].(*widget.Label).TextStyle = fyne.TextStyle{Bold: true}
			box.Objects[1].(*widget.Label).SetText(r.CourtType)
			box.Objects[2].(*widget.Label).SetText(stringOr(r.Judge, "—"))
			box.Objects[3].(*widget.Label).SetText(fmtDate(r.LegalForceDate))
		},
	)

	resultList.OnSelected = func(id widget.ListItemID) {
		if id < len(results) {
			r := results[id]
			go func() {
				body := map[string]string{"url": r.CaseURL, "courtId": r.CourtID, "courtType": r.CourtType}
				card, err := client.Post[client.CaseCard]("/parse/url", body)
				if err != nil {
					showSearchResultDetail(w, r, nil)
					return
				}
				showSearchResultDetail(w, r, &card)
			}()
		}
		resultList.UnselectAll()
	}

	// ── Add buttons ──
	addBtn := widget.NewButton("+ Добавить все", func() {
		mu.Lock()
		toAdd := make([]client.SearchResult, len(results))
		copy(toAdd, results)
		mu.Unlock()
		if len(toAdd) == 0 {
			return
		}
		go func() {
			added := 0
			for _, r := range toAdd {
				if r.CaseURL == "" {
					continue
				}
				body := map[string]string{
					"url": r.CaseURL, "courtId": r.CourtID,
					"courtCode": r.CourtCode, "courtType": r.CourtType,
					"caseNumber": r.CaseNumber,
				}
				_, err := client.Post[any]("/cases?parse=true", body)
				if err == nil {
					added++
				}
			}
			dialog.ShowInformation("Готово", fmt.Sprintf("✅ Добавлено в мониторинг: %d/%d", added, len(toAdd)), w)
		}()
	})

	// ── Wait tracking ──
	waitParty := widget.NewEntry()
	waitParty.SetPlaceHolder("ФИО истца/ответчика...")
	waitDate := widget.NewEntry()
	waitDate.SetPlaceHolder("Дата подачи (ГГГГ-ММ-ДД)")

	waitBtn := widget.NewButton("⏳ Следить за появлением", func() {
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
				dialog.ShowInformation("Готово", "✅ Отслеживание появления добавлено", w)
			}
		}()
	})

	// ── Layout ──
	sidebar := container.NewVBox(
		widget.NewLabelWithStyle("🏛️ Суд", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		courtEntry, courtInfo, courtResults,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("🔍 Режим поиска", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		modeSelect,
		numberPanel, partyPanel, uidPanel,
		widget.NewSeparator(),
		searchBtn, addBtn,
		widget.NewSeparator(),
		widget.NewLabelWithStyle("⏳ Отслеживание появления", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		waitParty, waitDate, waitBtn,
	)

	resultsPanel := container.NewBorder(
		resultCount, nil, nil, nil,
		resultList,
	)

	split := container.NewHSplit(sidebar, resultsPanel)
	split.Offset = 0.35

	return split
}

func showSearchResultDetail(w fyne.Window, r client.SearchResult, card *client.CaseCard) {
	body := container.NewVBox()

	body.Add(widget.NewLabelWithStyle(r.CaseNumber, fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
	if r.CaseURL != "" {
		body.Add(widget.NewLabel(r.CaseURL))
	}
	body.Add(widget.NewSeparator())

	addInfoRow(body, "Тип суда", r.CourtType)
	addInfoRow(body, "Судья", stringOr(r.Judge, "—"))
	addInfoRow(body, "Дата поступления", fmtDate(r.FilingDate))
	addInfoRow(body, "Дата решения", fmtDate(r.DecisionDate))
	addInfoRow(body, "Результат", stringOr(r.Result, "—"))
	addInfoRow(body, "Вступление в силу", fmtDate(r.LegalForceDate))

	if r.CaseUid != "" {
		body.Add(widget.NewSeparator())
		addInfoRow(body, "УИД", r.CaseUid)
	}

	if card != nil {
		if len(card.Parties) > 0 {
			body.Add(widget.NewSeparator())
			body.Add(widget.NewLabelWithStyle(fmt.Sprintf("👥 Участники (%d)", len(card.Parties)),
				fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
			for _, p := range card.Parties {
				body.Add(widget.NewLabel(fmt.Sprintf("  %s: %s", p.Role, p.Name)))
			}
		}
		if len(card.Events) > 0 {
			body.Add(widget.NewSeparator())
			body.Add(widget.NewLabelWithStyle(fmt.Sprintf("📅 События (%d)", len(card.Events)),
				fyne.TextAlignLeading, fyne.TextStyle{Bold: true}))
			n := len(card.Events)
			if n > 10 {
				n = 10
			}
			for i := len(card.Events) - 1; i >= len(card.Events)-n; i-- {
				e := card.Events[i]
				body.Add(widget.NewLabel(fmt.Sprintf("  • %s — %s", e.EventDate, e.EventName)))
			}
		}
	}

	addBtn := widget.NewButton("📋 В мониторинг", func() {
		go func() {
			body := map[string]string{
				"url": r.CaseURL, "courtId": r.CourtID,
				"courtType": r.CourtType, "caseNumber": r.CaseNumber,
			}
			_, err := client.Post[any]("/cases?parse=true", body)
			if err != nil {
				dialog.ShowError(fmt.Errorf("Ошибка: %w", err), w)
			} else {
				dialog.ShowInformation("Готово", "✅ Дело добавлено в мониторинг", w)
			}
		}()
	})

	scroll := container.NewVScroll(body)
	content := container.NewBorder(nil, addBtn, nil, nil, scroll)
	d := dialog.NewCustom("Детали дела", "✕ Закрыть", content, w)
	d.Resize(fyne.NewSize(600, 500))
	d.Show()
}
