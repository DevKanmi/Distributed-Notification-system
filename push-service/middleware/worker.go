package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/sony/gobreaker"
	"github.com/streadway/amqp" 
)

const (
	MaxRetries     = 5
	IdempotencyTTL = 7 * 24 * time.Hour 
)

type PushWorker struct {
	RabbitMQChannel *amqp.Channel
	RedisClient     *redis.Client
	HTTPClient      *http.Client
	FCMBreaker      *gobreaker.CircuitBreaker 

	// Service urls - REMEMBER TO IMPLEMENT!!!!!!!!!
	UserServiceURL    string
	TemplateServiceURL string
}

func NewPushWorker(ch *amqp.Channel, rdb *redis.Client) *PushWorker {
	// Initialize a circuit breaker for the external Push API (FCM/OneSignal).
	// This prevents cascading failures if the external provider is down.
	fcmBreaker := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "FCMDeliveryBreaker",
		MaxRequests: 1, 
		Timeout:     5 * time.Second, 
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			failureRatio := float64(counts.Failure) / float64(counts.TotalRequests)
			return counts.TotalRequests >= 10 && failureRatio >= 0.6
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			fmt.Printf("Circuit Breaker '%s' changed from %s to %s\n", name, from, to)
		},
	})

	return &PushWorker{
		RabbitMQChannel: ch,
		RedisClient:     rdb,
		HTTPClient:      &http.Client{Timeout: 5 * time.Second}, 
		FCMBreaker:      fcmBreaker,
		UserServiceURL:    "http://user-service:8081/api/v1/users",     // SOLO MOCK URL REMEMBER TO REMOVE!!!!!
		TemplateServiceURL: "http://template-service:8082/api/v1/templates", 
	}
}

func (w *PushWorker) ProcessMessage(d amqp.Delivery) {
	ctx := context.Background()
	var job PushNotificationJob

	if err := json.Unmarshal(d.Body, &job); err != nil {
		fmt.Printf("Error unmarshaling JSON: %v. Rejecting message.\n", err)
		d.Reject(false)
		return
	}

	fmt.Printf("[%s] Consuming job %s (Retry: %d)\n", job.CorrelationID, job.RequestID, job.RetryCount)

	// --- 1. IDEMPOTENCY CHECK ---
	if w.isDuplicate(ctx, job.RequestID) {
		fmt.Printf("[%s] Job already processed. Acknowledging duplicate.\n", job.CorrelationID)
		d.Ack(false)
		return
	}

	// --- 2. RETRY CHECK ---
	if job.RetryCount >= MaxRetries {
		fmt.Printf("[%s] Max retries reached (%d). Moving to failed.queue.\n", job.CorrelationID, job.RetryCount)
		d.Reject(false)
		return
	}

	// --- 3. SYNCHRONOUS LOOKUPS ---
	userData, err := w.fetchUserData(job.UserID)
	if err != nil {
		w.handleTransientFailure(d, &job, fmt.Errorf("user lookup failed: %w", err))
		return
	}
	templateData, err := w.fetchTemplateData(job.TemplateID)
	if err != nil {
		w.handleTransientFailure(d, &job, fmt.Errorf("template lookup failed: %w", err))
		return
	}

	renderedTitle, renderedBody, err := w.renderTemplate(templateData, job.Variables)
	if err != nil {
		fmt.Printf("[%s] Failed to render template (likely missing variables): %v. Rejecting.\n", job.CorrelationID, err)
		d.Reject(false) 
		return
	}

	deliveryErr := w.FCMBreaker.Execute(func() (interface{}, error) {
		return nil, w.sendPushNotification(userData.PushToken, renderedTitle, renderedBody, templateData.LinkURL)
	})

	if deliveryErr != nil {
		w.handleTransientFailure(d, &job, fmt.Errorf("push delivery failed (CB state: %s): %w", w.FCMBreaker.State().String(), deliveryErr))
		return
	}

	w.markAsProcessed(ctx, job.RequestID)
	d.Ack(false)
	fmt.Printf("[%s] Successfully processed notification for user %s.\n", job.CorrelationID, job.UserID)
}

func (w *PushWorker) isDuplicate(ctx context.Context, requestID string) bool {
	ok, err := w.RedisClient.SetNX(ctx, "push:processed:"+requestID, time.Now().Format(time.RFC3339), IdempotencyTTL).Result()
	if err != nil {
		fmt.Printf("Warning: Redis SETNX failed for %s. Cannot guarantee idempotency: %v\n", requestID, err)
		return false
	}
	return !ok 
}

func (w *PushWorker) markAsProcessed(ctx context.Context, requestID string) {
	w.RedisClient.Set(ctx, "push:processed:"+requestID, time.Now().Format(time.RFC3339), IdempotencyTTL)
}

func (w *PushWorker) handleTransientFailure(d amqp.Delivery, job *PushNotificationJob, err error) {
	fmt.Printf("[%s] Transient failure: %v. Retrying...\n", job.CorrelationID, err)

	job.RetryCount++
	newBody, _ := json.Marshal(job)
	d.Reject(false) 
}

func (w *PushWorker) fetchUserData(userID string) (UserData, error) {
	url := fmt.Sprintf("%s/%s", w.UserServiceURL, userID)
	resp, err := w.HTTPClient.Get(url)
	if err != nil {
		return UserData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return UserData{}, fmt.Errorf("user service returned status %d", resp.StatusCode)
	}

	var apiResp StandardizedResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return UserData{}, err
	}

	if !apiResp.Success || apiResp.Data == nil {
		return UserData{}, fmt.Errorf("user service failed: %s", apiResp.Message)
	}
	
	dataBytes, _ := json.Marshal(apiResp.Data)
	var userData UserData
	if err := json.Unmarshal(dataBytes, &userData); err != nil {
		return UserData{}, fmt.Errorf("failed to parse user data payload")
	}

	if userData.PushToken == "" {
		return UserData{}, fmt.Errorf("user has no push token")
	}
	return userData, nil
}

func (w *PushWorker) fetchTemplateData(templateID string) (TemplateData, error) {
	url := fmt.Sprintf("%s/%s", w.TemplateServiceURL, templateID)
	resp, err := w.HTTPClient.Get(url)
	if err != nil {
		return TemplateData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return TemplateData{}, fmt.Errorf("template service returned status %d", resp.StatusCode)
	}
	
	var apiResp StandardizedResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return TemplateData{}, err
	}

	if !apiResp.Success || apiResp.Data == nil {
		return TemplateData{}, fmt.Errorf("template service failed: %s", apiResp.Message)
	}

	dataBytes, _ := json.Marshal(apiResp.Data)
	var templateData TemplateData
	if err := json.Unmarshal(dataBytes, &templateData); err != nil {
		return TemplateData{}, fmt.Errorf("failed to parse template data payload")
	}

	return templateData, nil
}

func (w *PushWorker) renderTemplate(data TemplateData, variables map[string]string) (title string, body string, err error) {
	ctx := struct {
		Vars map[string]string
	}{
		Vars: variables,
	}

	titleTmpl, err := template.New("title").Parse(data.Title)
	if err != nil { return "", "", fmt.Errorf("failed to parse title template: %w", err) }
	var titleBuilder strings.Builder
	if err := titleTmpl.Execute(&titleBuilder, ctx); err != nil { return "", "", fmt.Errorf("failed to execute title template: %w", err) }

	bodyTmpl, err := template.New("body").Parse(data.Body)
	if err != nil { return "", "", fmt.Errorf("failed to parse body template: %w", err) }
	var bodyBuilder strings.Builder
	if err := bodyTmpl.Execute(&bodyBuilder, ctx); err != nil { return "", "", fmt.Errorf("failed to execute body template: %w", err) }

	return titleBuilder.String(), bodyBuilder.String(), nil
}

func (w *PushWorker) sendPushNotification(token, title, body, link string) error {
	// --- TO BE REPLACED WITH ACTUAL FCM OR ONESIGNAL FUNCTION!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! ---
	fmt.Printf("--- MOCK PUSH SENT ---\n")
	fmt.Printf("Token: %s\n", token)
	fmt.Printf("Title: %s\n", title)
	fmt.Printf("Body: %s\n", body)
	fmt.Printf("Link: %s\n", link)
	fmt.Printf("----------------------\n")
	return nil
}