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
		MaxRequests: 1, // Only one request allowed when half-open
		Timeout:     5 * time.Second, // Timeout for the half-open state
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			// Trip if 60% of requests failed and we've had at least 10 total requests.
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
		HTTPClient:      &http.Client{Timeout: 5 * time.Second}, // Dedicated client for lookups
		FCMBreaker:      fcmBreaker,
		UserServiceURL:    "http://user-service:8081/api/v1/users",     // Mock URL
		TemplateServiceURL: "http://template-service:8082/api/v1/templates", // Mock URL
	}
}

// ProcessMessage is the main logic handler for a single message dequeued from RabbitMQ.
func (w *PushWorker) ProcessMessage(d amqp.Delivery) {
	ctx := context.Background()
	var job PushNotificationJob

	if err := json.Unmarshal(d.Body, &job); err != nil {
		fmt.Printf("Error unmarshaling JSON: %v. Rejecting message.\n", err)
		d.Reject(false) // Reject message, do not requeue (permanent error)
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
		// We reject it without requeue, and let the DLX route it to failed.queue
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

	// --- 4. TEMPLATE RENDERING ---
	renderedTitle, renderedBody, err := w.renderTemplate(templateData, job.Variables)
	if err != nil {
		fmt.Printf("[%s] Failed to render template (likely missing variables): %v. Rejecting.\n", job.CorrelationID, err)
		d.Reject(false) // Permanent rendering error
		return
	}

	// --- 5. EXECUTE DELIVERY ---
	// The core logic is wrapped in the Circuit Breaker
	deliveryErr := w.FCMBreaker.Execute(func() (interface{}, error) {
		// Mock Push Notification Delivery (Replace with actual FCM/OneSignal SDK call)
		return nil, w.sendPushNotification(userData.PushToken, renderedTitle, renderedBody, templateData.LinkURL)
	})

	if deliveryErr != nil {
		// Circuit Breaker triggered or delivery failed
		w.handleTransientFailure(d, &job, fmt.Errorf("push delivery failed (CB state: %s): %w", w.FCMBreaker.State().String(), deliveryErr))
		return
	}

	w.markAsProcessed(ctx, job.RequestID)
	d.Ack(false)
	fmt.Printf("[%s] Successfully processed notification for user %s.\n", job.CorrelationID, job.UserID)
}

// isDuplicate checks Redis using SETNX to enforce idempotency.
func (w *PushWorker) isDuplicate(ctx context.Context, requestID string) bool {
	// Set the key only if it doesn't exist, and expire it after IdempotencyTTL
	ok, err := w.RedisClient.SetNX(ctx, "push:processed:"+requestID, time.Now().Format(time.RFC3339), IdempotencyTTL).Result()
	if err != nil {
		// If Redis is down, we assume it's NOT a duplicate to prevent service outage,
		// but log a warning.
		fmt.Printf("Warning: Redis SETNX failed for %s. Cannot guarantee idempotency: %v\n", requestID, err)
		return false
	}
	return !ok // If ok is false, the key already existed, so it's a duplicate.
}

// markAsProcessed is redundant if SETNX succeeds, but included for completeness.
func (w *PushWorker) markAsProcessed(ctx context.Context, requestID string) {
	// If the job succeeded, ensure the key is set (if it wasn't already).
	w.RedisClient.Set(ctx, "push:processed:"+requestID, time.Now().Format(time.RFC3339), IdempotencyTTL)
}

// handleTransientFailure increments retry count and rejects the message for DLQ routing.
func (w *PushWorker) handleTransientFailure(d amqp.Delivery, job *PushNotificationJob, err error) {
	fmt.Printf("[%s] Transient failure: %v. Retrying...\n", job.CorrelationID, err)

	job.RetryCount++
	// Re-encode the job with the updated retry count
	newBody, _ := json.Marshal(job)

	// Send the updated message back to the exchange for DLQ processing
	// This uses a custom publishing method to simulate the DLQ cycle back to the main queue
	// In a typical RabbitMQ DLX setup, you'd NACK or REJECT, and let the DLX/TTL rules handle the rest.
	
	// For simplicity in this example, we'll reject and log, relying on pre-configured DLX/TTL.
	// Production systems often require republishing for fine-grained control over headers.
	
	// Reject the message. If the queue is configured with a DLX, this routes it to the retry queue.
	d.Reject(false) // Requeue=false is essential to let DLX take over.
}

// fetchUserData mocks the synchronous REST call to the User Service.
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
	
	// Need to manually assert and convert the map back to the struct
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

// fetchTemplateData mocks the synchronous REST call to the Template Service.
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

	// Need to manually assert and convert the map back to the struct
	dataBytes, _ := json.Marshal(apiResp.Data)
	var templateData TemplateData
	if err := json.Unmarshal(dataBytes, &templateData); err != nil {
		return TemplateData{}, fmt.Errorf("failed to parse template data payload")
	}

	return templateData, nil
}

// renderTemplate fills the variables into the template strings.
func (w *PushWorker) renderTemplate(data TemplateData, variables map[string]string) (title string, body string, err error) {
	// Use map keys as template field names
	ctx := struct {
		Vars map[string]string
	}{
		Vars: variables,
	}

	// Render Title
	titleTmpl, err := template.New("title").Parse(data.Title)
	if err != nil { return "", "", fmt.Errorf("failed to parse title template: %w", err) }
	var titleBuilder strings.Builder
	if err := titleTmpl.Execute(&titleBuilder, ctx); err != nil { return "", "", fmt.Errorf("failed to execute title template: %w", err) }

	// Render Body
	bodyTmpl, err := template.New("body").Parse(data.Body)
	if err != nil { return "", "", fmt.Errorf("failed to parse body template: %w", err) }
	var bodyBuilder strings.Builder
	if err := bodyTmpl.Execute(&bodyBuilder, ctx); err != nil { return "", "", fmt.Errorf("failed to execute body template: %w", err) }

	return titleBuilder.String(), bodyBuilder.String(), nil
}

// sendPushNotification mocks the external API call (FCM/OneSignal).
func (w *PushWorker) sendPushNotification(token, title, body, link string) error {
	// --- Replace this entire function with actual FCM or OneSignal SDK calls ---
	fmt.Printf("--- MOCK PUSH SENT ---\n")
	fmt.Printf("Token: %s\n", token)
	fmt.Printf("Title: %s\n", title)
	fmt.Printf("Body: %s\n", body)
	fmt.Printf("Link: %s\n", link)
	fmt.Printf("----------------------\n")
	// If this were a real API call, any HTTP 5xx error or connection error would be returned here.
	// For example: return fmt.Errorf("FCM API returned 503 Service Unavailable")
	
	// Simulate a successful send
	return nil
}