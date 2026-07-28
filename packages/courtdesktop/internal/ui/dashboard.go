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

const (
	colNumber = iota
	colStatus
	colCourt
	colResult
	colLegalForce
	totalCols
)

func NewDashboardScreen(w fyne.Window) fyne.CanvasObject {
	var (
		mu           sync.Mutex
		cases        []client.WatchedCase
		filtered     []client.WatchedCase
		notif        []client.Notification
		dashStatus   *client.DashboardStatus
		filterStatus = "all"
		searchText   string
		sortCol      = colNumber
		sortAsc      = true
		curPage      int
		pageSize     = 20
		monBusy      bool
		monStartTime time.Time
		monDone      bool
		monProcessed int
		monErrors    int
	)

	var (
		pageLabel    *widget.Label
		prevBtn      *widget.Button
		nextBtn      *widget.Button
		table        *widget.Table
		loadAll      func()
		loadNotifs   func()
		refreshTable func()
		makeFilterBtns func()
	)

	headerNames := [totalCols]string{"Номер", "Статус", "Суд", "Результат", "Вступление"}
	var headerBtns [totalCols]*widget.Button

	sortFiltered := func() {
		sort.SliceStable(filtered, func(i, j int) bool {
			var less bool
			switch sortCol {
			case colNumber:
				less = filtered[i].Number < filtered[j].Number
			case colStatus:
				less = filtered[i].Status < filtered[j].Status
			case colCourt:
				ci := filtered[i].CourtName
				if ci == "" {
					ci = filtered[i].CourtID
				}
				cj := filtered[j].CourtName
				if cj == "" {
					cj = filtered[j].CourtID
				}
				less = ci < cj
			case colResult:
				less = filtered[i].Result < filtered[j].Result
			case colLegalForce:
				less = filtered[i].LegalForceDate < filtered[j].LegalForceDate
			}
			if sortAsc {
				return less
			}
			return !less
		})
	}

	applyFilter := func() {
		mu.Lock()
		defer mu.Unlock()
		filtered = make([]client.WatchedCase, 0, len(cases))
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
			filtered = append(filtered, c)
		}
		sortFiltered()
	}

	getPage := func() []client.WatchedCase {
		n := len(filtered)
		if n == 0 {
			return nil
		}
		if curPage*pageSize >= n {
			curPage = 0
		}
		start := curPage * pageSize
		end := start + pageSize
		if end > n {
			end = n
		}
		return filtered[start:end]
	}

	totalPages := func() int {
		n := len(filtered)
		if n == 0 {
			return 1
		}
		return (n + pageSize - 1) / pageSize
	}

	updateHeaders := func() {
		arrow := " ▲"
		if !sortAsc {
			arrow = " ▼"
		}
		for i := 0; i < totalCols; i++ {
			name := headerNames[i]
			if i == sortCol {
				headerBtns[i].SetText(name + arrow)
			} else {
				headerBtns[i].SetText(name)
			}
		}
	}

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

	monBtn := widget.NewButton("▶ Мониторинг", nil)
	refreshBtn := widget.NewButton("🔄", nil)

	pageLabel = widget.NewLabel("")
	prevBtn = widget.NewButton("← Назад", func() {
		curPage--
		refreshTable()
	})
	prevBtn.Importance = widget.LowImportance
	nextBtn = widget.NewButton("Вперёд →", func() {
		curPage++
		refreshTable()
	})
	nextBtn.Importance = widget.LowImportance

	progressLabel := widget.NewLabel("")
	progressBar := widget.NewProgressBar()
	progressDetail := widget.NewList(
		func() int {
			mu.Lock()
			defer mu.Unlock()
			return len(cases)
		},
		func() fyne.CanvasObject {
			return container.NewHBox(widget.NewLabel(""), widget.NewLabel(""))
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			mu.Lock()
			if id >= len(cases) {
				mu.Unlock()
				return
			}
			c := cases[id]
			mu.Unlock()
			box := obj.(*fyne.Container)
			icon := "○"
			if monBusy && !monStartTime.IsZero() {
				t, _ := time.Parse(time.RFC3339, c.UpdatedAt)
				if !t.IsZero() && t.After(monStartTime) {
					if c.Status == "error" {
						icon = "✗"
					} else {
						icon = "✓"
					}
				}
			} else if monDone {
				t, _ := time.Parse(time.RFC3339, c.UpdatedAt)
				if !t.IsZero() && t.After(monStartTime) {
					if c.Status == "error" {
						icon = "✗"
					} else {
						icon = "✓"
					}
				}
			}
			cn := c.CourtName
			if cn == "" {
				cn = c.CourtID
			}
			box.Objects[0].(*widget.Label).SetText(icon)
			box.Objects[1].(*widget.Label).SetText(fmt.Sprintf("%s — %s", c.Number, cn))
		},
	)
	progressDetail.SetItemHeight(0, 24)
	progressBox := container.NewVBox(progressLabel, progressBar)
	progressBox.Hidden = true

	monResultLabel := widget.NewLabel("")
	monResultLabel.Hidden = true

	notifLabel := widget.NewLabelWithStyle("🔔 Уведомления", fyne.TextAlignLeading, fyne.TextStyle{Bold: true})
	markReadBtn := widget.NewButton("✓ Прочитать все", nil)
	notifList := widget.NewList(
		func() int {
			mu.Lock()
			defer mu.Unlock()
			return len(notif)
		},
		func() fyne.CanvasObject {
			return container.NewHBox(widget.NewLabel(""), widget.NewLabel(""))
		},
		func(id widget.ListItemID, obj fyne.CanvasObject) {
			mu.Lock()
			if id >= len(notif) {
				mu.Unlock()
				return
			}
			n := notif[id]
			mu.Unlock()
			box := obj.(*fyne.Container)
			d := "○"
			if !n.Read {
				d = "●"
			}
			box.Objects[0].(*widget.Label).SetText(d)
			box.Objects[1].(*widget.Label).SetText(n.Message)
		},
	)

	headerRow := container.NewHBox()
	for i := 0; i < totalCols; i++ {
		col := i
		headerBtns[i] = widget.NewButton(headerNames[i], nil)
		headerBtns[i].Importance = widget.LowImportance
		headerBtns[i].OnTapped = func() {
			if sortCol == col {
				sortAsc = !sortAsc
			} else {
				sortCol = col
				sortAsc = true
			}
			updateHeaders()
			mu.Lock()
			sortFiltered()
			mu.Unlock()
			refreshTable()
		}
		headerRow.Add(headerBtns[i])
	}

	table = widget.NewTable(
		func() (int, int) {
			return len(getPage()), totalCols
		},
		func() fyne.CanvasObject {
			lbl := widget.NewLabel("")
			lbl.Truncation = fyne.TextTruncateEllipsis
			return lbl
		},
		func(id widget.TableCellID, obj fyne.CanvasObject) {
			items := getPage()
			if id.Row >= len(items) {
				obj.(*widget.Label).SetText("")
				return
			}
			c := items[id.Row]
			label := obj.(*widget.Label)
			label.Truncation = fyne.TextTruncateEllipsis
			switch id.Col {
			case colNumber:
				label.SetText(c.Number)
				label.TextStyle = fyne.TextStyle{Bold: true}
			case colStatus:
				label.SetText(statusText(c.Status))
				label.TextStyle = fyne.TextStyle{}
			case colCourt:
				cn := c.CourtName
				if cn == "" {
					cn = c.CourtID
				}
				label.SetText(cn)
				label.TextStyle = fyne.TextStyle{}
			case colResult:
				label.SetText(truncateStr(c.Result, 32))
				label.TextStyle = fyne.TextStyle{}
			case colLegalForce:
				label.SetText(fmtDate(c.LegalForceDate))
				label.TextStyle = fyne.TextStyle{}
			}
		},
	)
	table.OnSelected = func(id widget.TableCellID) {
		items := getPage()
		if id.Row < len(items) {
			showDetail(w, items[id.Row].UID)
		}
		table.UnselectAll()
	}
	table.SetColumnWidth(colNumber, 160)
	table.SetColumnWidth(colStatus, 110)
	table.SetColumnWidth(colCourt, 280)
	table.SetColumnWidth(colResult, 250)
	table.SetColumnWidth(colLegalForce, 120)

	refreshTable = func() {
		tp := totalPages()
		if curPage >= tp {
			curPage = tp - 1
		}
		if curPage < 0 {
			curPage = 0
		}
		s := curPage * pageSize
		e := s + pageSize
		if e > len(filtered) {
			e = len(filtered)
		}
		if len(filtered) == 0 {
			pageLabel.SetText("Нет дел")
		} else {
			pageLabel.SetText(fmt.Sprintf("%d–%d из %d", s+1, e, len(filtered)))
		}
		prevBtn.Disable()
		nextBtn.Disable()
		if curPage > 0 {
			prevBtn.Enable()
		}
		if curPage+1 < tp {
			nextBtn.Enable()
		}
		table.Refresh()
	}

	searchEntry.OnSubmitted = func(s string) {
		searchText = s
		curPage = 0
		applyFilter()
		refreshTable()
	}
	searchBtn := widget.NewButton("🔍", func() {
		searchText = searchEntry.Text
		curPage = 0
		applyFilter()
		refreshTable()
	})

	monBtn.OnTapped = func() {
		if monBusy {
			return
		}
		monBusy = true
		monDone = false
		monStartTime = time.Now()
		monProcessed = 0
		monErrors = 0
		monBtn.Disable()
		monBtn.SetText("⏳")
		progressBox.Hidden = false
		progressBar.Value = 0
		progressBar.Refresh()
		progressLabel.SetText("Запуск...")
		monResultLabel.Hidden = true
		progressDetail.Refresh()
		go func() {
			_, err := client.Post[any]("/parse/run", map[string]string{"mode": "full"})
			if err == nil {
				for i := 0; i < 120; i++ {
					time.Sleep(2 * time.Second)
					p, err := client.Get[client.ScanProgress]("/parse/progress")
					if err != nil {
						continue
					}
					if p.Total > 0 {
						monProcessed = p.Processed
						monErrors = p.Errors
						progressLabel.SetText(fmt.Sprintf("%d / %d  (ошибок: %d)", p.Processed, p.Total, p.Errors))
						progressBar.Value = float64(p.Processed) / float64(p.Total)
						progressBar.Refresh()
						progressDetail.Refresh()
					}
					if !p.Running || p.Processed >= p.Total {
						break
					}
				}
			}
			monBusy = false
			monDone = true
			success := monProcessed - monErrors
			monResultLabel.SetText(fmt.Sprintf("Итого: %d обработано, %d успешно, %d ошибок", monProcessed, success, monErrors))
			monResultLabel.Hidden = false
			progressLabel.SetText("")
			progressBar.Value = 1.0
			progressBar.Refresh()
			monBtn.Enable()
			monBtn.SetText("▶ Мониторинг")
			progressDetail.Refresh()
			loadAll()
		}()
	}
	refreshBtn.OnTapped = func() { loadAll() }

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
			loadNotifs()
		}()
	}

	filterDefs := []struct{ s, l string }{
		{"all", "Все"}, {"monitoring", "Мониторинг"}, {"waiting", "Ожидание"},
		{"decision", "Решение"}, {"enforced", "Вступило"}, {"error", "Ошибка"}, {"archived", "Архив"},
	}
	filterBar := container.NewHBox()
	makeFilterBtns = func() {
		filterBar.RemoveAll()
		for _, f := range filterDefs {
			s, l := f.s, f.l
			btn := widget.NewButton(l, func() {
				filterStatus = s
				curPage = 0
				makeFilterBtns()
				applyFilter()
				refreshTable()
			})
			if s == filterStatus {
				btn.Importance = widget.HighImportance
			} else {
				btn.Importance = widget.LowImportance
			}
			filterBar.Add(btn)
		}
	}

	updateCounters := func() {
		mu.Lock()
		d := dashStatus
		t := len(cases)
		mu.Unlock()
		m, ww, dec, enf := 0, 0, 0, 0
		if d != nil {
			m, ww, dec, enf = d.Monitoring, d.Waiting, d.Decision, d.EnforcedToday
		}
		cntMonitoring.SetText(fmt.Sprintf("%d", m))
		cntWaiting.SetText(fmt.Sprintf("%d", ww))
		cntDecision.SetText(fmt.Sprintf("%d", dec))
		cntEnforced.SetText(fmt.Sprintf("%d", enf))
		cntTotal.SetText(fmt.Sprintf("%d", t))
	}

	loadNotifs = func() {
		n, err := client.Get[[]client.Notification]("/notifications")
		if err != nil {
			return
		}
		mu.Lock()
		notif = n
		unread := 0
		for _, nn := range n {
			if !nn.Read {
				unread++
			}
		}
		mu.Unlock()
		notifList.Refresh()
		if unread > 0 {
			notifLabel.SetText(fmt.Sprintf("🔔 %d непрочитанных", unread))
		} else {
			notifLabel.SetText("🔔 Все прочитано")
		}
	}

	loadAll = func() {
		go func() {
			var wg sync.WaitGroup
			wg.Add(3)
			go func() {
				defer wg.Done()
				if c, err := client.Get[[]client.WatchedCase]("/cases"); err == nil {
					mu.Lock()
					cases = c
					mu.Unlock()
				}
			}()
			go func() {
				defer wg.Done()
				if s, err := client.Get[client.DashboardStatus]("/status"); err == nil {
					mu.Lock()
					dashStatus = &s
					mu.Unlock()
				}
			}()
			go func() {
				defer wg.Done()
				loadNotifs()
			}()
			wg.Wait()
			applyFilter()
			updateCounters()
			refreshTable()
		}()
	}

	triggerRefresh = loadAll

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			loadAll()
		}
	}()

	topPanel := container.NewVBox(
		container.NewGridWithColumns(5,
			container.NewCenter(container.NewVBox(cntMonitoring, widget.NewLabel("Мониторинг"))),
			container.NewCenter(container.NewVBox(cntWaiting, widget.NewLabel("Ожидают"))),
			container.NewCenter(container.NewVBox(cntDecision, widget.NewLabel("Решено"))),
			container.NewCenter(container.NewVBox(cntEnforced, widget.NewLabel("Вступило сегодня"))),
			container.NewCenter(container.NewVBox(cntTotal, widget.NewLabel("Всего"))),
		),
		filterBar,
		container.NewHBox(searchEntry, searchBtn, monBtn, refreshBtn),
		progressBox,
		monResultLabel,
	)

	bottomPanel := container.NewVBox(
		widget.NewSeparator(),
		container.NewHBox(prevBtn, pageLabel, nextBtn, layout.NewSpacer()),
		widget.NewSeparator(),
		container.NewHBox(notifLabel, layout.NewSpacer(), markReadBtn),
		notifList,
	)
	notifList.SetItemHeight(0, 28)

	monPanel := container.NewVBox(
		widget.NewLabelWithStyle("Прогресс по делам:", fyne.TextAlignLeading, fyne.TextStyle{Bold: true}),
		progressDetail,
	)
	monPanelScroll := container.NewVScroll(monPanel)
	monPanelScroll.SetMinSize(fyne.NewSize(0, 200))

	rightSide := container.NewVSplit(
		container.NewBorder(headerRow, nil, nil, nil, table),
		monPanelScroll,
	)
	rightSide.SetOffset(0.7)

	content := container.NewBorder(topPanel, bottomPanel, nil, nil, rightSide)

	makeFilterBtns()
	updateHeaders()
	loadAll()

	return content
}

func truncateStr(s string, n int) string {
	if s == "" {
		return "—"
	}
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
