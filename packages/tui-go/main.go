package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// ── ТИПЫ ──────────────────────────────────────────

type WatchedCase struct {
	UID            string `json:"uid"`
	Number         string `json:"number"`
	Status         string `json:"status"`
	CourtID        string `json:"courtId,omitempty"`
	CourtName      string `json:"courtName,omitempty"`
	Result         string `json:"result,omitempty"`
	LegalForceDate string `json:"legalForceDate,omitempty"`
	CreatedAt      string `json:"createdAt,omitempty"`
	LastChecked    string `json:"lastChecked,omitempty"`
	ErrorCount     int    `json:"errorCount,omitempty"`
	LastError      string `json:"lastError,omitempty"`
	URL            string `json:"url,omitempty"`
}

type CaseEvent struct {
	ID        string `json:"id,omitempty"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	CreatedAt string `json:"createdAt,omitempty"`
}

type DashboardStatus struct {
	Total      int    `json:"total"`
	Monitoring int    `json:"monitoring"`
	Waiting    int    `json:"waiting"`
	Decision   int    `json:"decision"`
	Health     string `json:"health"`
}

type Notification struct {
	UID      string `json:"uid,omitempty"`
	Type     string `json:"type"`
	Message  string `json:"message"`
	Read     bool   `json:"read,omitempty"`
	CaseUID  string `json:"caseUid,omitempty"`
	CaseNum  string `json:"caseNumber,omitempty"`
	Created  string `json:"createdAt,omitempty"`
}

type Settings struct {
	RefreshInterval int    `json:"refreshInterval,omitempty"`
	DefaultMode     string `json:"defaultMode,omitempty"`
}

type APIResponse[T any] struct {
	Success bool   `json:"success"`
	Data    T      `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

type Progress struct {
	Total   int    `json:"total"`
	Current int    `json:"current"`
	Phase   string `json:"phase"`
}

// ── СТИЛИ ─────────────────────────────────────────

var (
	clrStatus = map[string]lipgloss.Color{
		"monitoring": lipgloss.Color("6"),  // cyan
		"waiting":    lipgloss.Color("3"),  // yellow
		"decision":   lipgloss.Color("2"),  // green
		"enforced":   lipgloss.Color("2"),
		"archived":   lipgloss.Color("8"),
		"error":      lipgloss.Color("1"),  // red
	}

	statusRU = map[string]string{
		"waiting": "Ожидание", "monitoring": "Мониторинг",
		"decision": "Решено", "enforced": "В силе",
		"archived": "Архив", "error": "Ошибка",
	}
)

func stCol(s string) lipgloss.Color {
	if c, ok := clrStatus[s]; ok {
		return c
	}
	return lipgloss.Color("7")
}

func stText(s string) string {
	if r, ok := statusRU[s]; ok {
		return r
	}
	return s
}

// ── API ───────────────────────────────────────────

const apiBase = "http://127.0.0.1:8767/api"

var httpClient = &http.Client{Timeout: 10 * time.Second}

func apiGet[T any](path string) (T, error) {
	var zero T
	resp, err := httpClient.Get(apiBase + path)
	if err != nil {
		return zero, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return zero, fmt.Errorf("read: %w", err)
	}
	var apiResp APIResponse[T]
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return zero, fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return zero, fmt.Errorf("%s", apiResp.Error)
	}
	return apiResp.Data, nil
}

func apiPost[T any](path string, body any) (T, error) {
	var zero T
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = strings.NewReader(string(b))
	}
	req, err := http.NewRequest("POST", apiBase+path, r)
	if err != nil {
		return zero, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse[T]
	if err := json.Unmarshal(b, &apiResp); err != nil {
		return zero, fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return zero, fmt.Errorf("%s", apiResp.Error)
	}
	return apiResp.Data, nil
}

func apiDelete(path string) error {
	req, err := http.NewRequest("DELETE", apiBase+path, nil)
	if err != nil {
		return err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse[any]
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return fmt.Errorf("%s", apiResp.Error)
	}
	return nil
}

func apiPatch[T any](path string, body any) (T, error) {
	var zero T
	b, _ := json.Marshal(body)
	req, err := http.NewRequest("PATCH", apiBase+path, strings.NewReader(string(b)))
	if err != nil {
		return zero, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("HTTP: %w", err)
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse[T]
	if err := json.Unmarshal(rb, &apiResp); err != nil {
		return zero, fmt.Errorf("json: %w", err)
	}
	if !apiResp.Success {
		return zero, fmt.Errorf("%s", apiResp.Error)
	}
	return apiResp.Data, nil
}

// ── СООБЩЕНИЯ ─────────────────────────────────────

type casesLoaded struct {
	cases []WatchedCase
	err   string
}
type statusLoaded struct {
	status *DashboardStatus
	err    string
}
type eventsLoaded struct {
	events []CaseEvent
	err    string
}
type notifsLoaded struct {
	notifs []Notification
	err    string
}
type settingsLoaded struct {
	settings *Settings
	err      string
}
type progressMsg struct {
	p Progress
}
type runDone struct {
	msg string
}
type addDone struct{}
type deleteDone struct {
	err string
}
type readDone struct{}

// ── СОСТОЯНИЕ ─────────────────────────────────────

type tab int
const (
	tabCases tab = iota
	tabNotifs
	tabRun
)

type page int
const (
	pList page = iota
	pDetail
	pAdd
	pDelete
)

type model struct {
	cases  []WatchedCase
	status *DashboardStatus
	notifs []Notification
	events []CaseEvent
	settings *Settings
	apiErr string

	tab  tab
	page page
	cur  int    // cursor на списке
	vt   int    // scroll top
	dsc  int    // detail scroll

	// фильтр
	filter   string
	filterOn bool

	// добавление
	addNum  string
	addStep int // 0=number, 1=type, 2=confirm

	// подтверждение удаления
	deleteUID string
	deleteNum string

	// уведомления
	notifCur int

	// запуск
	runLog  []string
	runBusy bool

	// прогресс прогона
	prog *Progress

	// окно
	W, H int

	// загрузка
	firstLoad bool
}

func initModel() model {
	return model{
		tab:  tabCases,
		page: pList,
		W:    80,
		H:    24,
	}
}

// ── COMMANDS ──────────────────────────────────────

func loadCasesCmd() tea.Msg {
	c, err := apiGet[[]WatchedCase]("/cases")
	if err != nil {
		return casesLoaded{err: err.Error()}
	}
	return casesLoaded{cases: c}
}

func loadStatusCmd() tea.Msg {
	s, err := apiGet[DashboardStatus]("/status")
	if err != nil {
		return statusLoaded{err: err.Error()}
	}
	return statusLoaded{status: &s}
}

func loadNotifsCmd() tea.Msg {
	n, err := apiGet[[]Notification]("/notifications")
	if err != nil {
		return notifsLoaded{err: err.Error()}
	}
	return notifsLoaded{notifs: n}
}

func loadEventsCmd(uid string) tea.Msg {
	e, err := apiGet[[]CaseEvent]("/cases/" + uid + "/events")
	if err != nil {
		return eventsLoaded{err: err.Error()}
	}
	return eventsLoaded{events: e}
}

func loadSettingsCmd() tea.Msg {
	s, err := apiGet[Settings]("/settings")
	if err != nil {
		return settingsLoaded{err: err.Error()}
	}
	return settingsLoaded{settings: &s}
}

func addCaseCmd(number, courtType string) tea.Msg {
	body := map[string]string{"number": number, "courtType": courtType}
	_, err := apiPost[any]("/cases", body)
	if err != nil {
		// попробуем search/by-number если /cases не сработал
		_, err2 := apiPost[any]("/search/by-number", body)
		if err2 != nil {
			return addDone{}
		}
		_ = err2
	}
	return addDone{}
}

func deleteCaseCmd(uid string) tea.Msg {
	err := apiDelete("/cases/" + uid)
	if err != nil {
		return deleteDone{err: err.Error()}
	}
	return deleteDone{}
}

func markReadCmd(uid string) tea.Msg {
	_, _ = apiPatch[any]("/notifications/" + uid + "/read", nil)
	return readDone{}
}

func runCmd(mode string, m *model) tea.Cmd {
	ts := time.Now().Format("15:04:05")
	m.runLog = append(m.runLog, fmt.Sprintf("%s  → %s", ts, mode))
	m.runBusy = true
	return func() tea.Msg {
		_, err := apiPost[any]("/parse/run", map[string]string{"mode": mode})
		m.runBusy = false
		ts := time.Now().Format("15:04:05")
		if err != nil {
			m.runLog = append(m.runLog, fmt.Sprintf("%s  ✗ %s: %v", ts, mode, err))
		} else {
			m.runLog = append(m.runLog, fmt.Sprintf("%s  ✓ %s", ts, mode))
		}
		return runDone{msg: mode}
	}
}

// ── INIT ──────────────────────────────────────────

func (m model) Init() tea.Cmd {
	m.firstLoad = true
	return tea.Batch(loadCasesCmd, loadStatusCmd, loadSettingsCmd)
}

// ── UPDATE ────────────────────────────────────────

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.W = msg.Width
		m.H = msg.Height
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg.String())

	case casesLoaded:
		m.firstLoad = false
		if msg.err != "" {
			m.apiErr = msg.err
		} else {
			m.cases, m.apiErr = msg.cases, ""
			m.cur = clamp(m.cur, 0, max(0, len(m.cases)-1))
		}
		return m, nil

	case statusLoaded:
		if msg.err == "" {
			m.status = msg.status
		}
		return m, nil

	case eventsLoaded:
		if msg.err == "" {
			m.events = msg.events
		}
		return m, nil

	case notifsLoaded:
		if msg.err == "" {
			m.notifs = msg.notifs
		}
		return m, nil

	case settingsLoaded:
		if msg.err == "" {
			m.settings = msg.settings
		}
		return m, nil

	case runDone:
		return m, tea.Batch(loadCasesCmd, loadStatusCmd)

	case addDone:
		m.page = pList
		m.addNum, m.addStep = "", 0
		return m, tea.Batch(loadCasesCmd, loadStatusCmd)

	case deleteDone:
		m.page = pList
		m.deleteUID, m.deleteNum = "", ""
		if msg.err != "" {
			m.apiErr = msg.err
		}
		return m, tea.Batch(loadCasesCmd, loadStatusCmd)

	case readDone:
		return m, loadNotifsCmd
	}
	return m, nil
}

// ── KEY HANDLER ───────────────────────────────────

func (m model) handleKey(key string) (tea.Model, tea.Cmd) {
	if key == "q" || key == "й" || key == "ctrl+c" {
		return m, tea.Quit
	}
	if key == "ctrl+r" {
		return m, tea.Batch(loadCasesCmd, loadStatusCmd)
	}

	switch m.page {
	case pAdd:
		return m.handleAddKey(key)
	case pDelete:
		return m.handleDeleteKey(key)
	case pDetail:
		return m.handleDetailKey(key)
	}

	// общие клавиши вкладок
	if key == "1" || key == "tab" {
		m.tab = tabCases; m.page = pList; m.filter, m.filterOn = "", false; return m, nil
	}
	if key == "2" {
		m.tab = tabNotifs; m.notifCur = 0; return m, loadNotifsCmd
	}
	if key == "3" {
		m.tab = tabRun; return m, nil
	}

	switch m.tab {
	case tabCases:
		return m.handleCasesNav(key)
	case tabNotifs:
		return m.handleNotifsNav(key)
	case tabRun:
		return m.handleRunKey(key)
	}
	return m, nil
}

// ── Вкладка: ДЕЛА ─────────────────────────────────

func (m model) handleCasesNav(key string) (tea.Model, tea.Cmd) {
	filtered := m.filt()

	// режим фильтра
	if m.filterOn {
		if key == "esc" || key == "enter" { m.filterOn = false; return m, nil }
		if key == "backspace" && len(m.filter) > 0 { m.filter = m.filter[:len(m.filter)-1]; return m, nil }
		if len(key) == 1 { m.filter += key; m.cur = 0; return m, nil }
		return m, nil
	}

	if key == "/" || key == "и" { m.filterOn = true; m.filter = ""; return m, nil }
	if (key == "up" || key == "k") && m.cur > 0 { m.cur--; return m, nil }
	if (key == "down" || key == "j") && m.cur < len(filtered)-1 { m.cur++; return m, nil }
	if key == "pgup" { m.cur = max(0, m.cur-(m.H-5)); return m, nil }
	if key == "pgdown" { m.cur = min(len(filtered)-1, m.cur+(m.H-5)); return m, nil }
	if key == "home" { m.cur = 0; return m, nil }
	if key == "end" { m.cur = max(0, len(filtered)-1); return m, nil }
	if key == "enter" && len(filtered) > 0 {
		// отразим cur на реальный индекс в m.cases
		if m.filter != "" {
			// сопоставляем filtered[cur] обратно в cases
			fc := filtered[m.cur]
			for i, c := range m.cases {
				if c.UID == fc.UID { m.cur = i; break }
			}
		}
		m.page = pDetail
		m.dsc = 0
		m.events = nil
		return m, func() tea.Msg { return loadEventsCmd(m.cases[m.cur].UID) }
	}
	if key == "a" || key == "ф" { m.page = pAdd; m.addNum = ""; m.addStep = 0; return m, nil }
	if key == "d" || key == "в" {
		fc := m.filt()
		if len(fc) > 0 {
			c := fc[m.cur]
			m.deleteUID = c.UID
			m.deleteNum = c.Number
			m.page = pDelete
		}
		return m, nil
	}
	// F-ключи — короткие прогоны
	if key == "f4" { m.tab = tabRun; return m, runCmd("full", &m) }
	if key == "f5" { m.tab = tabRun; return m, runCmd("retry", &m) }
	if key == "f6" { m.tab = tabRun; return m, runCmd("new", &m) }

	return m, nil
}

// ── Вкладка: УВЕДОМЛЕНИЯ ──────────────────────────

func (m model) handleNotifsNav(key string) (tea.Model, tea.Cmd) {
	if (key == "up" || key == "k") && m.notifCur > 0 { m.notifCur--; return m, nil }
	if (key == "down" || key == "j") && m.notifCur < len(m.notifs)-1 { m.notifCur++; return m, nil }
	if key == "enter" && len(m.notifs) > 0 {
		n := m.notifs[m.notifCur]
		if !n.Read {
			return m, func() tea.Msg { return markReadCmd(n.UID) }
		}
		return m, nil
	}
	if key == "r" || key == "к" { return m, loadNotifsCmd }
	if key == "esc" { m.tab = tabCases; return m, nil }
	return m, nil
}

// ── Вкладка: ЗАПУСК ───────────────────────────────

func (m model) handleRunKey(key string) (tea.Model, tea.Cmd) {
	if m.runBusy {
		return m, nil
	}
	if key == "f" || key == "а" { return m, runCmd("full", &m) }
	if key == "r" || key == "к" { return m, runCmd("retry", &m) }
	if key == "n" || key == "т" { return m, runCmd("new", &m) }
	return m, nil
}

// ── СТРАНИЦЫ ──────────────────────────────────────

func (m model) handleAddKey(key string) (tea.Model, tea.Cmd) {
	if key == "esc" { m.page = pList; m.addNum, m.addStep = "", 0; return m, nil }
	if m.addStep == 0 {
		// ввод номера дела
		if key == "enter" && m.addNum != "" { m.addStep = 1; return m, nil }
		if key == "backspace" && len(m.addNum) > 0 { m.addNum = m.addNum[:len(m.addNum)-1]; return m, nil }
		if len(key) == 1 { m.addNum += key; return m, nil }
		return m, nil
	}
	if m.addStep == 1 {
		// выбор типа суда
		if key == "1" { return m, func() tea.Msg { return addCaseCmd(m.addNum, "district") } }
		if key == "2" { return m, func() tea.Msg { return addCaseCmd(m.addNum, "appeal") } }
		if key == "3" { return m, func() tea.Msg { return addCaseCmd(m.addNum, "magistrate") } }
		if key == "4" { return m, func() tea.Msg { return addCaseCmd(m.addNum, "") } }
		return m, nil
	}
	return m, nil
}

func (m model) handleDeleteKey(key string) (tea.Model, tea.Cmd) {
	if key == "esc" || key == "n" || key == "т" || key == "н" {
		m.page = pList; m.deleteUID, m.deleteNum = "", ""; return m, nil
	}
	if key == "y" || key == "д" || key == "enter" {
		uid := m.deleteUID
		m.page = pList; m.deleteUID, m.deleteNum = "", ""
		return m, func() tea.Msg { return deleteCaseCmd(uid) }
	}
	return m, nil
}

func (m model) handleDetailKey(key string) (tea.Model, tea.Cmd) {
	if key == "esc" || key == "q" || key == "й" {
		m.page = pList; m.events = nil; return m, nil
	}
	if key == "up" || key == "k" { m.dsc = max(0, m.dsc-1); return m, nil }
	if key == "down" || key == "j" { m.dsc++; return m, nil }
	if key == "pgup" { m.dsc = max(0, m.dsc-(m.H-6)); return m, nil }
	if key == "pgdown" { m.dsc += m.H - 6; return m, nil }
	return m, nil
}

// ── VIEW ──────────────────────────────────────────

func (m model) View() string {
	if m.firstLoad {
		return lipgloss.NewStyle().Width(m.W).Render("Загрузка...")
	}

	var b strings.Builder
	m.renderTabs(&b)

	switch m.tab {
	case tabCases:
		switch m.page {
		case pList:
			m.renderCaseList(&b)
		case pDetail:
			m.renderDetail(&b)
		case pAdd:
			m.renderAdd(&b)
		case pDelete:
			m.renderDelete(&b)
		}
	case tabNotifs:
		m.renderNotifs(&b)
	case tabRun:
		m.renderRun(&b)
	}

	m.renderStatus(&b)
	return lipgloss.NewStyle().Width(m.W).Render(b.String())
}

func (m model) renderTabs(b *strings.Builder) {
	tabs := []struct {
		id    tab
		label string
	}{
		{tabCases, fmt.Sprintf(" ДЕЛА (%d) ", len(m.cases))},
		{tabNotifs, fmt.Sprintf(" УВЕД (%d) ", m.notifCount())},
		{tabRun, " ЗАПУСК "},
	}

	for _, t := range tabs {
		style := lipgloss.NewStyle().Padding(0, 1)
		if m.tab == t.id {
			style = style.Bold(true).Reverse(true)
		}
		b.WriteString(" ")
		b.WriteString(style.Render(t.label))
	}
	b.WriteString("\n")
}

// ── СПИСОК ДЕЛ ────────────────────────────────────

func (m model) renderCaseList(b *strings.Builder) {
	filtered := m.filt()
	listH := m.H - 4
	colNum, colStatus, colCourt, colRes := colW(m.W)

	// заголовок
	b.WriteString(faint(" "))
	b.WriteString(bold(pad("№ ДЕЛА", colNum)))
	b.WriteString(" " + bold(pad("СТАТУС", colStatus)))
	b.WriteString(" " + bold(pad("СУД", colCourt)))
	b.WriteString(" " + bold(pad("РЕШЕНИЕ", colRes)))
	b.WriteString("\n")

	if len(filtered) == 0 {
		b.WriteString(faint("  Нет дел\n"))
		b.WriteString(strings.Repeat("\n", max(0, listH-2)))
		m.renderFilter(b)
		return
	}

	m.cur = clamp(m.cur, 0, len(filtered)-1)
	maxVt := max(0, len(filtered)-listH)
	m.vt = clamp(m.cur-listH/2, 0, maxVt)

	shown := filtered[m.vt:]
	if len(shown) > listH {
		shown = shown[:listH]
	}

	for i, c := range shown {
		idx := m.vt + i
		sel := idx == m.cur
		cn := strOr(c.CourtName, c.CourtID, "—")

		line := fmt.Sprintf(" %s %s %s %s",
			pad(c.Number, colNum),
			pad(stText(c.Status), colStatus),
			pad(cn, colCourt),
			pad(c.Result, colRes))

		if sel {
			b.WriteString(lipgloss.NewStyle().Reverse(true).Bold(true).Render(line))
		} else if c.Status == "error" {
			b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render(line))
		} else {
			b.WriteString(line)
		}
		b.WriteString("\n")
	}

	// пустые строки
	for i := len(shown); i < listH; i++ {
		b.WriteString("\n")
	}

	// фильтр
	m.renderFilter(b)

	// ошибка API
	if m.apiErr != "" && len(m.cases) == 0 {
		b.WriteString("\n" + lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("  Ошибка: "+m.apiErr))
		b.WriteString(faint("\n  Запустите API: npm start"))
	}
}

func (m model) renderFilter(b *strings.Builder) {
	if m.filterOn {
		b.WriteString(faint(fmt.Sprintf("  Фильтр: %s█", m.filter)))
	} else if m.filter != "" {
		b.WriteString(faint(fmt.Sprintf("  Фильтр: %s [%d/%d]  Esc сброс", m.filter, len(m.filt()), len(m.cases))))
	}
}

// ── ДЕТАЛИ ДЕЛА ───────────────────────────────────

func (m model) renderDetail(b *strings.Builder) {
	if m.cur < 0 || m.cur >= len(m.cases) {
		m.page = pList; return
	}
	c := m.cases[m.cur]
	cn := strOr(c.CourtName, c.CourtID, "—")
	W := max(m.W, 20)

	sep := faint(strings.Repeat("─", W))
	lines := []string{}

	lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("6")).Render(
		bold(fmt.Sprintf(" %s", c.Number))))
	lines = append(lines, "  "+cn)
	lines = append(lines, "  "+lipgloss.NewStyle().Foreground(stCol(c.Status)).Render(stText(c.Status)))
	lines = append(lines, sep)

	det := func(label, val string) {
		if val == "" { return }
		label = "  " + label + ":"
		indent := strings.Repeat(" ", 26)
		vw := W - 28
		vals := wrap(val, vw, indent)
		b.WriteString(fmt.Sprintf("%-24s %s\n", label, vals[0]))
		for _, l := range vals[1:] {
			b.WriteString(l + "\n")
		}
	}
	_ = det

	// Собираем детали в строки
	if c.Result != "" {
		lines = append(lines, "  Результат:    "+c.Result)
	}
	if c.LegalForceDate != "" {
		lines = append(lines, "  Вступило:     "+fmtDate(c.LegalForceDate))
	}
	if c.CreatedAt != "" {
		lines = append(lines, "  Добавлено:    "+fmtDate(c.CreatedAt))
	}
	if c.LastChecked != "" {
		lines = append(lines, "  Проверка:     "+fmtDT(c.LastChecked))
	}
	if c.ErrorCount > 0 {
		lines = append(lines, lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render(
			fmt.Sprintf("  Ошибок:       %d", c.ErrorCount)))
	}
	if c.LastError != "" {
		lines = append(lines, sep)
		lines = append(lines, "  "+bold(lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render("Ошибка:")))
		for _, l := range wrap(c.LastError, W-4, "    ") {
			lines = append(lines, "  "+lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render(l))
		}
	}

	// События
	if len(m.events) > 0 {
		lines = append(lines, sep)
		lines = append(lines, bold("  СОБЫТИЯ"))
		for _, e := range m.events {
			ts := fmtDT(e.CreatedAt)
			lines = append(lines, fmt.Sprintf("  %s %s %s", faint(ts), m.eventIcon(e.Type), e.Message))
		}
	}

	if c.URL != "" {
		lines = append(lines, sep)
		for _, l := range wrap(c.URL, W-2, "  ") {
			lines = append(lines, "  "+faint(l))
		}
	}

	vis := m.H - 3
	maxScroll := max(0, len(lines)-vis)
	m.dsc = clamp(m.dsc, 0, maxScroll)

	start := m.dsc
	end := min(start+vis, len(lines))
	for _, l := range lines[start:end] {
		b.WriteString(l + "\n")
	}
	// пустые
	for i := (end - start); i < vis; i++ {
		b.WriteString("\n")
	}
	// промотка
	if len(lines) > vis {
		pct := float64(m.dsc) / float64(max(1, maxScroll))
		tp := int(pct * float64(vis-1))
		for i := 0; i < vis; i++ {
			if i == tp {
				b.WriteString(lipgloss.NewStyle().Reverse(true).Render(" "))
			} else {
				b.WriteString("│")
			}
		}
	}
	b.WriteString("\n" + faint(fmt.Sprintf("↑↓ скролл  esc/q назад  [%d/%d]", m.cur+1, len(m.cases))))
}

func (m model) eventIcon(typ string) string {
	switch typ {
	case "created": return "+"
	case "checked": return "•"
	case "error": return "✗"
	case "decision": return "⚡"
	case "deleted": return "✕"
	default: return "›"
	}
}

// ── ДОБАВЛЕНИЕ ────────────────────────────────────

func (m model) renderAdd(b *strings.Builder) {
	b.WriteString("\n")
	b.WriteString(bold("  ДОБАВЛЕНИЕ ДЕЛА\n"))
	b.WriteString(faint("  ─────────────────\n\n"))

	if m.addStep == 0 {
		b.WriteString(fmt.Sprintf("  Номер дела: %s█\n\n", m.addNum))
		b.WriteString(faint("  Enter — далее  Esc — отмена\n"))
		return
	}

	b.WriteString(fmt.Sprintf("  Номер дела: %s\n\n", m.addNum))
	b.WriteString("  Тип суда:\n\n")
	b.WriteString(faint("  1 — Районный суд\n"))
	b.WriteString(faint("  2 — Областной / апелляция\n"))
	b.WriteString(faint("  3 — Мировой суд\n"))
	b.WriteString(faint("  4 — Автоопределение\n\n"))
	b.WriteString(faint("  Esc — отмена\n"))
}

// ── УДАЛЕНИЕ ──────────────────────────────────────

func (m model) renderDelete(b *strings.Builder) {
	b.WriteString("\n\n")
	b.WriteString(lipgloss.NewStyle().Foreground(lipgloss.Color("3")).Render(bold("  УДАЛИТЬ ДЕЛО?")))
	b.WriteString("\n\n")
	b.WriteString(fmt.Sprintf("  Дело: %s\n\n", m.deleteNum))
	b.WriteString(faint("  y/д/Enter — удалить  n/н/Esc — отмена\n"))
}

// ── УВЕДОМЛЕНИЯ ───────────────────────────────────

func (m model) renderNotifs(b *strings.Builder) {
	listH := m.H - 4

	if len(m.notifs) == 0 {
		b.WriteString(faint("  Нет уведомлений\n"))
		b.WriteString(strings.Repeat("\n", max(0, listH-2)))
		b.WriteString(faint("  r — обновить  esc — назад"))
		return
	}

	m.notifCur = clamp(m.notifCur, 0, len(m.notifs)-1)

	start := m.notifCur
	end := start + listH
	if end > len(m.notifs) {
		end = len(m.notifs)
	}

	for i := start; i < end; i++ {
		n := m.notifs[i]
		sel := i == m.notifCur
		readMark := " "
		if !n.Read { readMark = "●" }
		ts := fmtDT(n.Created)
		line := fmt.Sprintf(" %s %s %s  %s", readMark, ts, n.Type, n.Message)

		if sel {
			b.WriteString(lipgloss.NewStyle().Reverse(true).Bold(true).Render(" "+line) + "\n")
		} else if !n.Read {
			b.WriteString(lipgloss.NewStyle().Bold(true).Render(" " + line) + "\n")
		} else {
			b.WriteString(faint(" " + line) + "\n")
		}
	}

	for i := (end - start); i < listH; i++ {
		b.WriteString("\n")
	}

	b.WriteString(faint("  ↑↓ выбор  Enter — прочитано  r — обновить  esc — назад"))
}

// ── ЗАПУСК ────────────────────────────────────────

func (m model) renderRun(b *strings.Builder) {
	label := "ЗАПУСК МОНИТОРИНГА"
	if m.runBusy {
		label += "  ⟳ выполняется..."
	}
	b.WriteString(bold("  " + label))
	b.WriteString("\n\n")
	b.WriteString(faint("  f — Полный прогон\n"))
	b.WriteString(faint("  r — Retry (ошибки)\n"))
	b.WriteString(faint("  n — Новые дела\n\n"))

	logH := m.H - 8
	log := m.runLog
	if len(log) > logH {
		log = log[len(log)-logH:]
	}
	for _, l := range log {
		b.WriteString("  " + faint(l) + "\n")
	}
	for i := len(log); i < logH; i++ {
		b.WriteString("\n")
	}
	if m.runBusy {
		b.WriteString(faint("  [выполняется...]"))
	} else {
		b.WriteString(faint("  1:Дела  2:Увед  q:Выход"))
	}
}

// ── СТАТУС-БАР ────────────────────────────────────

func (m model) renderStatus(b *strings.Builder) {
	w := max(m.W, 20)
	errN := 0
	for _, c := range m.cases {
		if c.Status == "error" { errN++ }
	}

	var parts []string
	// здоровье
	if m.status != nil {
		sym, col := "✓", lipgloss.Color("2")
		switch m.status.Health {
		case "degraded": sym, col = "⚠", lipgloss.Color("3")
		case "error":    sym, col = "✗", lipgloss.Color("1")
		}
		parts = append(parts, lipgloss.NewStyle().Foreground(col).Render(sym))
		parts = append(parts, faint(fmt.Sprintf("M:%d W:%d D:%d",
			m.status.Monitoring, m.status.Waiting, m.status.Decision)))
	}
	if errN > 0 {
		parts = append(parts, lipgloss.NewStyle().Foreground(lipgloss.Color("1")).Render(fmt.Sprintf("Ош:%d", errN)))
	}
	parts = append(parts, faint(fmt.Sprintf("[%s]", m.tabName())))

	// подсказка
	var hint string
	switch m.tab {
	case tabCases:
		hint = "1 2 3 /:Поиск a:Доб d:Удл Enter:Детали ↑↓ q:Выход"
	case tabNotifs:
		hint = "1 2 3 ↑↓ Enter:Прочит r:Обн esc q"
	case tabRun:
		hint = "f:Full r:Retry n:New 1:Дела q:Выход"
	}

	line := strings.Join(parts, "  │  ")
	sp := max(0, w-len(hint)-2)
	line = trunc(line, sp)
	sp2 := max(0, w-len(line)-len(hint)-1)
	b.WriteString(faint(strings.Repeat("─", w)))
	b.WriteString("\n " + line + strings.Repeat(" ", sp2) + faint(hint))
}

func (m model) tabName() string {
	switch m.tab {
	case tabCases:  return "дела"
	case tabNotifs: return "увед"
	case tabRun:    return "запуск"
	}
	return ""
}

func (m model) notifCount() int {
	if len(m.notifs) == 0 { return 0 }
	c := 0
	for _, n := range m.notifs {
		if !n.Read { c++ }
	}
	return c
}

// ── ФИЛЬТР ────────────────────────────────────────

func (m model) filt() []WatchedCase {
	if m.filter == "" {
		return m.cases
	}
	f := strings.ToLower(m.filter)
	var out []WatchedCase
	for _, c := range m.cases {
		if containsCI(c.Number, f) || containsCI(c.CourtName, f) ||
			containsCI(c.CourtID, f) || containsCI(stText(c.Status), f) {
			out = append(out, c)
		}
	}
	return out
}

// ── УТИЛИТЫ ───────────────────────────────────────

func colW(total int) (num, status, court, result int) {
	if total < 40 { return 18, 10, 10, 10 }
	num = min(26, int(float64(total)*0.22))
	status = min(14, int(float64(total)*0.14))
	court = min(32, int(float64(total)*0.28))
	result = max(10, total-num-status-court-5)
	return
}

func pad(s string, w int) string {
	if s == "" { s = "—" }
	if len(s) > w { return s[:w-1] + "…" }
	return s + strings.Repeat(" ", max(0, w-len(s)))
}

func wrap(s string, w int, indent string) []string {
	if s == "" { return []string{"—"} }
	var out []string
	for len(s) > 0 {
		pre := ""
		if len(out) > 0 { pre = indent }
		end := min(w, len(s))
		out = append(out, pre+s[:end])
		s = s[end:]
	}
	return out
}

func containsCI(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), substr)
}

func trunc(s string, w int) string {
	if len(s) <= w { return s }
	return s[:w-1] + "…"
}

func strOr(vals ...string) string {
	for _, v := range vals {
		if v != "" { return v }
	}
	return ""
}

func fmtDate(iso string) string {
	if iso == "" { return "—" }
	if len(iso) >= 10 && iso[2] == '.' && iso[5] == '.' { return iso[:10] }
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil { return iso }
	return t.Format("02.01.2006")
}

func fmtDT(iso string) string {
	if iso == "" { return "—" }
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil { return iso }
	return t.Format("02.01.2006 15:04")
}

func bold(s string) string { return lipgloss.NewStyle().Bold(true).Render(s) }
func faint(s string) string { return lipgloss.NewStyle().Faint(true).Render(s) }

func clamp(v, lo, hi int) int {
	if v < lo { return lo }
	if v > hi { return hi }
	return v
}

// ── MAIN ──────────────────────────────────────────

func main() {
	p := tea.NewProgram(initModel(), tea.WithAltScreen())
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "TUI error: %v\n", err)
		os.Exit(1)
	}
}
