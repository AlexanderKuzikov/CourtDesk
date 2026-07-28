package ui

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/widget"

	"github.com/AlexanderKuzikov/CourtDesk/packages/courtdesktop/internal/client"
)

func NewDashboardScreen(w fyne.Window) fyne.CanvasObject {
	var (
		mu           sync.Mutex
		cases        []client.WatchedCase
		notif        []client.Notification
		dashStatus   *client.DashboardStatus
		filterStatus = "all"
		searchText   = ""
		curPage      = 0
		pageSize     = 20
		monBusy      bool
	)

	var (
		filtered      func() []client.WatchedCase
		pageItems     func() []client.WatchedCase
		updatePagin   func()
		rebuildChips  func()
		loadAll       func()
		refreshNotifs func()
		renderCases   func()
	)

	// ── Widgets ──
	cntMonitoring := widget.NewLabel("0")
	cntMonitoring.TextStyle = fyne.TextStyle{Bold: true}
	cntWaiting := widget.NewLabel("0")
	cntWaiting.TextStyle = fyne.TextStyle{Bold: true}
	cntDecision := widget.NewLabel("0")
	cntDecision.TextStyle = fyne.TextStyle{Bold: true}
	cntEnforced := widget.NewLabel("0")
	cntEnforced.TextStyle = fyne.TextStyle{Bold: true}
	cntTotal := widget.NewLabel("0")
	cntTotal.TextStyle = fyne.TextStyle{Bold: true}

	searchEntry := widget.NewEntry()
	searchEntry.SetPlaceHolder("Поиск по номеру / суду...")

	searchBtn := widget.NewButton("🔍", nil)
	monBtn := widget.NewButton("▶ Мониторинг", nil)
	refreshBtn := widget.NewButton("🔄", nil)

	pageLabel := widget.NewLabel("")
	prevBtn := widget.NewButton("← Назад", nil)
	prevBtn.Importance = widget.LowImportance
	nextBtn := widget.NewButton("Вперёд →", nil)
	nextBtn.Importance = widget.LowImportance

	// Progress bar
	progressLabel := widget.NewLabel("")
	progressBar := widget.NewProgressBar()
	progressBox := container.NewVBox(progressLabel, progressBar)
	progressBox.Hidden = true

	// Notification area
	notifLabel := widget.NewLabelWithStyle("🔔 Уведомления", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	notifList := widget.NewList(
		func() int {
			mu.Lock()
			defer mu.Unlock()
			return len(notif)
		},
		func() fyne.CanvasObject {
			return container.NewHBox(
				widget.NewLabel(""),
				widget.NewLabel(""),
			)
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			mu.Lock()
			n := notif
			mu.Unlock()
			if id >= len(n) {
				return
			}
			box := obj.(*fyne.Container)
			indicator := "⬤"
			if n[id].Read {
				indicator = "○"
			}
			box.Objects[0].(*widget.Label).SetText(indicator)
			box.Objects[1].(*widget.Label).SetText(n[id].Message)
		},
	)
	notifContainer := container.NewBorder(nil, nil, nil, nil, notifList)
	notifContainer.Resize(fyne.NewSize(0, 180))

	markReadBtn := widget.NewButton("✓ Прочитать все", nil)

	// ── Filtering ──
	filtered = func() []client.WatchedCase {
		mu.Lock()
		defer mu.Unlock()
		out := make([]client.WatchedCase, 0, len(cases))
		for _, c := range cases {
			if filterStatus != "all" && c.Status != filterStatus {
				continue
			}
			if searchText != "" {
				q := strings.ToLower(searchText)
				if !strings.Contains(strings.ToLower(c.Number), q) &&
					!strings.Contains(strings.ToLower(c.CourtName), q) &&
					!strings.Contains(strings.ToLower(c.CourtID), q) {
					continue
				}
			}
			out = append(out, c)
		}
		sort.Slice(out, func(i, j int) bool {
			return out[i].UpdatedAt > out[j].UpdatedAt
		})
		return out
	}

	pageItems = func() []client.WatchedCase {
		fc := filtered()
		start := curPage * pageSize
		if start >= len(fc) {
			curPage = 0
			start = 0
		}
		end := start + pageSize
		if end > len(fc) {
			end = len(fc)
		}
		return fc[start:end]
	}

	totalPages := func() int {
		fc := filtered()
		if len(fc) == 0 {
			return 1
		}
		return (len(fc) + pageSize - 1) / pageSize
	}

	// ── Case table (VBox + Scroll instead of List for reliable refresh) ──
	caseContainer := container.NewVBox()
	caseScroll := container.NewVScroll(caseContainer)

	renderCases := func() {
		caseContainer.RemoveAll()
		items := pageItems()
		for _, c := range items {
			row := makeCaseRow(c, w)
			caseContainer.Add(row)
		}
		caseContainer.Refresh()
		caseScroll.Refresh()
	}

	type clickableRow struct {
		widget.Label
		uid string
	}

	// ── Helpers ──
	updateCounters := func() {
		mu.Lock()
		d := dashStatus
		total := len(cases)
		mu.Unlock()
		m, w, dec, enf := 0, 0, 0, 0
		if d != nil {
			m, w, dec, enf = d.Monitoring, d.Waiting, d.Decision, d.EnforcedToday
		}
		cntMonitoring.SetText(fmt.Sprintf("%d", m))
		cntWaiting.SetText(fmt.Sprintf("%d", w))
		cntDecision.SetText(fmt.Sprintf("%d", dec))
		cntEnforced.SetText(fmt.Sprintf("%d", enf))
		cntTotal.SetText(fmt.Sprintf("%d", total))
	}

	updatePagin = func() {
		tp := totalPages()
		if curPage >= tp {
			curPage = tp - 1
		}
		if curPage < 0 {
			curPage = 0
		}
		fc := filtered()
		start := curPage * pageSize
		end := start + pageSize
		if end > len(fc) {
			end = len(fc)
		}
		if len(fc) == 0 {
			pageLabel.SetText("Нет дел")
		} else {
			pageLabel.SetText(fmt.Sprintf("%d–%d из %d", start+1, end, len(fc)))
		}
		if curPage <= 0 {
			prevBtn.Disable()
		} else {
			prevBtn.Enable()
		}
		if curPage+1 >= tp {
			nextBtn.Disable()
		} else {
			nextBtn.Enable()
		}
	}

	// ── Filter chips ──
	filterDefs := []struct {
		status string
		label  string
	}{
		{"all", "Все"},
		{"monitoring", "Мониторинг"},
		{"waiting", "Ожидание"},
		{"decision", "Решение"},
		{"enforced", "Вступило"},
		{"error", "Ошибка"},
		{"archived", "Архив"},
	}

	filterBar := container.NewHBox()
	rebuildChips = func() {
		filterBar.RemoveAll()
		for _, fd := range filterDefs {
			s := fd.status
			btn := widget.NewButton(fd.label, func() {
				filterStatus = s
				curPage = 0
				rebuildChips()
				updatePagin()
				renderCases()
			})
			if s == filterStatus {
				btn.Importance = widget.HighImportance
			} else {
				btn.Importance = widget.LowImportance
			}
			filterBar.Add(btn)
		}
	}

	// ── Callbacks ──
	searchEntry.OnSubmitted = func(s string) {
		searchText = s
		curPage = 0
		updatePagin()
		renderCases()
	}
	searchBtn.OnTapped = func() {
		searchText = searchEntry.Text
		curPage = 0
		updatePagin()
		renderCases()
	}

	monBtn.OnTapped = func() {
		if monBusy {
			return
		}
		monBusy = true
		monBtn.Disable()
		monBtn.SetText("⏳ Выполняется...")
		progressBox.Hidden = false
		progressBar.Value = 0
		progressBar.Refresh()
		progressLabel.SetText("Запуск мониторинга...")

		go func() {
			_, err := client.Post[any]("/parse/run", map[string]string{"mode": "full"})
			if err == nil {
				for i := 0; i < 60; i++ {
					time.Sleep(2 * time.Second)
					p, err := client.Get[client.ScanProgress]("/parse/progress")
					if err != nil {
						continue
					}
					if p.Total > 0 {
						progressLabel.SetText(fmt.Sprintf("Мониторинг: %d/%d (ошибок: %d)", p.Processed, p.Total, p.Errors))
						progressBar.Value = float64(p.Processed) / float64(p.Total)
						progressBar.Refresh()
					}
					if !p.Running || p.Processed >= p.Total {
						break
					}
				}
			}
			progressBox.Hidden = true
			progressLabel.SetText("")
			monBusy = false
			monBtn.Enable()
			monBtn.SetText("▶ Мониторинг")
			loadAll()
		}()
	}

	refreshBtn.OnTapped = func() { loadAll() }
	prevBtn.OnTapped = func() {
		if curPage > 0 {
			curPage--
		}
		updatePagin()
		renderCases()
	}
	nextBtn.OnTapped = func() {
		cp := curPage + 1
		if cp < totalPages() {
			curPage = cp
		}
		updatePagin()
		renderCases()
	}

	markReadBtn.OnTapped = func() {
		go func() {
			mu.Lock()
			items := make([]client.Notification, len(notif))
			copy(items, notif)
			mu.Unlock()
			for _, n := range items {
				if !n.Read {
					_, _ = client.Patch[any]("/notifications/"+n.UID+"/read", nil)
				}
			}
			refreshNotifs()
		}()
	}

	// ── Data load ──
	loadAll = func() {
		go func() {
			var wg sync.WaitGroup
			wg.Add(3)
			go func() {
				defer wg.Done()
				c, err := client.Get[[]client.WatchedCase]("/cases")
				if err == nil {
					mu.Lock()
					cases = c
					mu.Unlock()
				}
			}()
			go func() {
				defer wg.Done()
				s, err := client.Get[client.DashboardStatus]("/status")
				if err == nil {
					mu.Lock()
					dashStatus = &s
					mu.Unlock()
				}
			}()
			go func() {
				defer wg.Done()
				refreshNotifs()
			}()
			wg.Wait()
			updateCounters()
			updatePagin()
			caseList.Refresh()
		}()
	}

	refreshNotifs = func() {
		n, err := client.Get[[]client.Notification]("/notifications")
		if err == nil {
			mu.Lock()
			notif = n
			mu.Unlock()
			notifList.Refresh()
			unread := 0
			for _, nn := range n {
				if !nn.Read {
					unread++
				}
			}
			if unread > 0 {
				notifLabel.SetText(fmt.Sprintf("🔔 %d непрочитанных", unread))
			} else {
				notifLabel.SetText("🔔 Все прочитано")
			}
		}
	}

	// ── Auto-refresh ──
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			loadAll()
		}
	}()

	// ── Layout ──
	headerRow := container.NewHBox(
		widget.NewLabelWithStyle("Номер", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		layout.NewSpacer(),
		widget.NewLabelWithStyle("Статус", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		layout.NewSpacer(),
		widget.NewLabelWithStyle("Суд", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		layout.NewSpacer(),
		widget.NewLabelWithStyle("Результат", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		layout.NewSpacer(),
		widget.NewLabelWithStyle("Вступление", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
	)

	topPanel := container.NewVBox(
		container.NewGridWithColumns(5,
			makeCounterCard("Мониторинг", cntMonitoring),
			makeCounterCard("Ожидают", cntWaiting),
			makeCounterCard("Решено", cntDecision),
			makeCounterCard("Вступило сегодня", cntEnforced),
			makeCounterCard("Всего", cntTotal),
		),
		filterBar,
		container.NewHBox(searchEntry, searchBtn, monBtn, refreshBtn),
		progressBox,
	)

	bottomPanel := container.NewVBox(
		widget.NewSeparator(),
		container.NewHBox(prevBtn, pageLabel, nextBtn, layout.NewSpacer()),
		widget.NewSeparator(),
		container.NewHBox(notifLabel, layout.NewSpacer(), markReadBtn),
		notifList,
	)

	casePanel := container.NewBorder(headerRow, nil, nil, nil, caseList)
	content := container.NewBorder(topPanel, bottomPanel, nil, nil, casePanel)

	rebuildChips()
	loadAll()

	return content
}

func truncate(s string, n int) string {
	if s == "" {
		return "—"
	}
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}
