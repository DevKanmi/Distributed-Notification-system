package models

type PushNotificationJob struct {
	RequestID    string            `json:"request_id"`    
	UserID       string            `json:"user_id"`     
	TemplateID   string            `json:"template_id"`  
	Variables    map[string]string `json:"variables"`    
	CorrelationID string            `json:"correlation_id"` 
	RetryCount   int               `json:"retry_count"`   
}

type UserData struct {
	PushToken string `json:"push_token"` 
	Language  string `json:"language"`
	IsActive  bool   `json:"is_active"`
}

type TemplateData struct {
	Title   string `json:"title"`
	Body    string `json:"body"`
	LinkURL string `json:"link_url"`
	Image   string `json:"image"`
}

type StandardizedResponse struct {
	Success bool              `json:"success"`
	Data    interface{}       `json:"data"`
	Error   string            `json:"error"`
	Message string            `json:"message"`
	Meta    PaginationMeta `json:"meta"`
}

type PaginationMeta struct {
	Total          int  `json:"total"`
	Limit          int  `json:"limit"`
	Page           int  `json:"page"`
	TotalPages     int  `json:"total_pages"`
	HasNext        bool `json:"has_next"`
	HasPrevious    bool `json:"has_previous"`
}