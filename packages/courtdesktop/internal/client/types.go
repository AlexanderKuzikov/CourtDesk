package client

type WatchedCase struct {
	UID              string `json:"uid"`
	URL              string `json:"url,omitempty"`
	Number           string `json:"number"`
	Status           string `json:"status"`
	CourtID          string `json:"courtId,omitempty"`
	CourtCode        string `json:"courtCode,omitempty"`
	CourtType        string `json:"courtType,omitempty"`
	CourtName        string `json:"courtName,omitempty"`
	CaseUid          string `json:"caseUid,omitempty"`
	Result           string `json:"result,omitempty"`
	LegalForceDate   string `json:"legalForceDate,omitempty"`
	LegalForceNotified bool `json:"legalForceNotified,omitempty"`
	EnforcedAt       string `json:"enforcedAt,omitempty"`
	UserID           string `json:"userId,omitempty"`
	LastChecked      string `json:"lastChecked,omitempty"`
	CreatedAt        string `json:"createdAt,omitempty"`
	UpdatedAt        string `json:"updatedAt,omitempty"`
	ErrorCount       int    `json:"errorCount,omitempty"`
	LastError        string `json:"lastError,omitempty"`
}

type CaseEvent struct {
	ID        string `json:"id,omitempty"`
	Type      string `json:"type"`
	Message   string `json:"message"`
	CreatedAt string `json:"createdAt,omitempty"`
}

type CaseCard struct {
	UID         string         `json:"uid,omitempty"`
	Type        string         `json:"type,omitempty"`
	Court       string         `json:"court,omitempty"`
	CourtType   string         `json:"courtType,omitempty"`
	Parties     []CaseParty    `json:"parties,omitempty"`
	Events      []CardEvent    `json:"events,omitempty"`
	PublishedAt string         `json:"publishedAt,omitempty"`
	ModifiedAt  string         `json:"modifiedAt,omitempty"`
	Card        *CaseCardInner `json:"card,omitempty"`
	Identifiers *CaseIdentifiers `json:"identifiers,omitempty"`
}

type CaseCardInner struct {
	Category       []string `json:"category,omitempty"`
	Judge          string   `json:"judge,omitempty"`
	FilingDate     string   `json:"filingDate,omitempty"`
	HearingDate    string   `json:"hearingDate,omitempty"`
	ProceedingType string   `json:"proceedingType,omitempty"`
	Result         string   `json:"result,omitempty"`
}

type CaseIdentifiers struct {
	CaseUID string `json:"case_uid,omitempty"`
	DeloID  string `json:"delo_id,omitempty"`
}

type CaseParty struct {
	Role     string `json:"role,omitempty"`
	Name     string `json:"name,omitempty"`
	INN      string `json:"inn,omitempty"`
	KPP      string `json:"kpp,omitempty"`
	OGRN     string `json:"ogrn,omitempty"`
	OGRNIP   string `json:"ogrnip,omitempty"`
}

type CardEvent struct {
	EventDate string `json:"eventDate,omitempty"`
	EventTime string `json:"eventTime,omitempty"`
	EventName string `json:"eventName,omitempty"`
	Result    string `json:"result,omitempty"`
	Judge     string `json:"judge,omitempty"`
	Location  string `json:"location,omitempty"`
}

type SearchResult struct {
	CaseNumber     string              `json:"caseNumber"`
	CaseURL        string              `json:"caseUrl"`
	UID            string              `json:"uid,omitempty"`
	Judge          string              `json:"judge,omitempty"`
	Result         string              `json:"result,omitempty"`
	LegalForceDate string              `json:"legalForceDate,omitempty"`
	FilingDate     string              `json:"filingDate,omitempty"`
	DecisionDate   string              `json:"decisionDate,omitempty"`
	Parties        []map[string]string `json:"parties,omitempty"`
	CourtID        string              `json:"courtId,omitempty"`
	CourtCode      string              `json:"courtCode,omitempty"`
	CourtType      string              `json:"courtType,omitempty"`
	CaseUid        string              `json:"caseUid,omitempty"`
	MatchScore     int                 `json:"matchScore,omitempty"`
}

type SearchResponse struct {
	Found   bool           `json:"found"`
	Count   int            `json:"count"`
	Results []SearchResult `json:"results"`
	Court   *CourtInfo     `json:"court,omitempty"`
}

type CourtInfo struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	CourtType string `json:"courtType,omitempty"`
	Subdomain string `json:"subdomain,omitempty"`
	Region    string `json:"region,omitempty"`
	Address   string `json:"address,omitempty"`
	Website   string `json:"website,omitempty"`
	Phone     string `json:"phone,omitempty"`
	OKTMO     string `json:"oktmo,omitempty"`
}

type DashboardStatus struct {
	Monitoring    int    `json:"monitoring"`
	Waiting       int    `json:"waiting"`
	Decision      int    `json:"decision"`
	EnforcedToday int    `json:"enforcedToday"`
	Health        string `json:"health"`
}

type Notification struct {
	UID     string `json:"uid,omitempty"`
	Type    string `json:"type"`
	Message string `json:"message"`
	Read    bool   `json:"read,omitempty"`
	CaseUID string `json:"caseUid,omitempty"`
	CaseNum string `json:"caseNumber,omitempty"`
	Created string `json:"createdAt,omitempty"`
}

type AppSettings struct {
	ScheduleFull      string `json:"scheduleFull,omitempty"`
	RetryIntervalHours int   `json:"retryIntervalHours,omitempty"`
	RetryStaleHours   int    `json:"retryStaleHours,omitempty"`
	ScheduleEnabled   bool   `json:"scheduleEnabled,omitempty"`
}

type APIResponse[T any] struct {
	Success bool   `json:"success"`
	Data    T      `json:"data,omitempty"`
	Error   string `json:"error,omitempty"`
}

type ScanProgress struct {
	Running   bool `json:"running"`
	Total     int  `json:"total"`
	Processed int  `json:"processed"`
	Errors    int  `json:"errors"`
}
