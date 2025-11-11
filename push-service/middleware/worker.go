package middleware

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"time"

	"firebase.google.com/go/messaging" 
	"github.com/go-redis/redis/v8"
	"github.com/sony/gobreaker"
	"github.com/streadway/amqp"
	"github.com/ezrahel/models"
)

// PushWorker holds the dependencies required for processing a push notification job.
type PushWorker struct {
	// Clients
	RabbitMQChannel *amqp.Channel
	RedisClient     *redis.Client
	FCMClient       *messaging.Client         // Firebase Messaging Client
	HTTPClient      *http.Client
	FCMBreaker      *gobreaker.CircuitBreaker 
	Config          Config                    

	// Service URLs
	UserServiceURL    string
	TemplateServiceURL string
}

// NewPushWorker initializes the worker with the necessary components and configuration.
// It now accepts the FCM client.
func NewPushWorker(ch *amqp.Channel, rdb *redis.Client, fcmClient *messaging.Client, cfg Config) *PushWorker {
	// Initialize a circuit breaker for the external Push API (FCM/OneSignal).
	fcmBreaker := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "FCMDeliveryBreaker",
		MaxRequests: 1, 
		Timeout:     5 * time.Second, 
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			// Trip if 60% of requests failed and we've had at least 10 total requests.
			failureRatio := float64(counts.TotalFailures) / float64(counts.Requests)
			return counts.Requests >= 10 && failureRatio >= 0.6
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			userData, err := w.fetchUserData(job.UserID)
			if err != nil { w.handleTransientFailure(ctx, d, &job, fmt.Errorf("user lookup failed: %w", err)); return }
	})

			if err != nil { w.handleTransientFailure(ctx, d, &job, fmt.Errorf("template lookup failed: %w", err)); return }
		RabbitMQChannel: ch,
		RedisClient:     rdb,
		FCMClient:       fcmClient, // SET FCM CLIENT
		HTTPClient:      &http.Client{Timeout: 5 * time.Second},
		FCMBreaker:      fcmBreaker,
		Config:          cfg,
		UserServiceURL:    cfg.UserServiceURL,
		TemplateServiceURL: cfg.TemplateServiceURL,
	}
}

// ProcessMessage is the main logic handler for a single message dequeued from RabbitMQ.
func (w *PushWorker) ProcessMessage(d amqp.Delivery) {
	ctx := context.Background()
	var job models.PushNotificationJob

	if err := json.Unmarshal(d.Body, &job); err != nil {
		fmt.Printf("Error unmarshaling JSON (Permanent Failure): %v. Rejecting message.\n", err)
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
	if job.RetryCount >= w.Config.MaxRetries { 
		fmt.Printf("[%s] Max retries reached (%d). Routing to DLQ failed.queue.\n", job.CorrelationID, job.RetryCount)
		d.Reject(false) 
		return 
	}

	// --- 3. SYNCHRONOUS LOOKUPS ---
	userData, err := w.fetchUserData(job.UserID)
	if err != nil { w.handleTransientFailure(d, &job, fmt.Errorf("user lookup failed: %w", err)); return }
	templateData, err := w.fetchTemplateData(job.TemplateID)
	if err != nil { w.handleTransientFailure(d, &job, fmt.Errorf("template lookup failed: %w", err)); return }

	// --- 4. TEMPLATE RENDERING ---
	renderedTitle, renderedBody, err := w.renderTemplate(templateData, job.Variables)
	if err != nil { 
		fmt.Printf("[%s] Failed to render template (Permanent Failure): %v. Rejecting.\n", job.CorrelationID, err)
		d.Reject(false) 
		return
	}

	// --- 5. EXECUTE DELIVERY (Wrapped in Circuit Breaker) ---
	_,deliveryErr := w.FCMBreaker.Execute(func() (interface{}, error) {
		return nil, w.sendFCMNotification(ctx, userData.PushToken, renderedTitle, renderedBody, templateData.LinkURL)
	})

	if deliveryErr != nil {
		w.handleTransientFailure(ctx, d, &job, fmt.Errorf("push delivery failed (CB state: %s): %w", w.FCMBreaker.State().String(), deliveryErr))
		return
	}

	// --- 6. SUCCESS ---
	w.markAsProcessed(ctx, job.RequestID)
	d.Ack(false)
	fmt.Printf("[%s] Successfully processed notification for user %s.\n", job.CorrelationID, job.UserID)
}


// sendFCMNotification is the **REAL** implementation using the Firebase Admin SDK.
func (w *PushWorker) sendFCMNotification(ctx context.Context, token, title, body, link string) error {
	
	// Create the FCM message payload
	message := &messaging.Message{
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Data: map[string]string{
			"link_url": link, // Send link as data for custom app handling
		},
		Token: token, // Target the specific device token
	}

	// Send the message using the client
	response, err := w.FCMClient.Send(ctx, message)
	
	if err != nil {
		// Log the error returned by the FCM API
		fmt.Printf("FCM Send Error: %v\n", err)
		return fmt.Errorf("fcm send failure: %w", err)
	}

	// Log success and the FCM Message ID
	fmt.Printf("FCM Message sent successfully: %s\n", response)
	
	return nil
}

// isDuplicate checks Redis using SETNX to enforce idempotency.
func (w *PushWorker) isDuplicate(ctx context.Context, requestID string) bool {
	// Use Config TTL
	ok, err := w.RedisClient.SetNX(ctx, "push:processed:"+requestID, time.Now().Format(time.RFC3339), w.Config.IdempotencyTTL).Result()
	if err != nil {
		// Production Change: Log this with a WARN level
		fmt.Printf("Warning: Redis SETNX failed for %s. Cannot guarantee idempotency: %v\n", requestID, err)
		return false
	}
	return !ok 
}

// markAsProcessed ensures the key is properly set upon success.
func (w *PushWorker) markAsProcessed(ctx context.Context, requestID string) {
	w.RedisClient.Set(ctx, "push:processed:"+requestID, time.Now().Format(time.RFC3339), w.Config.IdempotencyTTL)
}

// handleTransientFailure increments retry count and rejects the message for DLQ routing.
// It now accepts a context so it can cleanup the idempotency key in Redis when re-queuing.
func (w *PushWorker) handleTransientFailure(ctx context.Context, d amqp.Delivery, job *models.PushNotificationJob, err error) {
	// Production Change: Log this with an ERROR level, including correlation ID
	fmt.Printf("[%s] Transient failure (Retry %d/%d): %v. Re-queuing via DLX.\n", job.CorrelationID, job.RetryCount, w.Config.MaxRetries, err)

	job.RetryCount++
	
	// In the current simple DLX setup, we re-publish with the updated body 
	// before rejecting, which provides more control over the message content.
	
	newBody, marshalErr := json.Marshal(job)
	if marshalErr != nil {
		fmt.Printf("CRITICAL: Failed to re-marshal job for retry, losing progress: %v\n", marshalErr)
		d.Reject(false) // Reject permanently to failed queue
		return
	}

	// Publish the updated job body back to the exchange.
	publishErr := w.RabbitMQChannel.Publish(
		w.Config.ExchangeName, // Exchange to publish to
		w.Config.QueueName,    // Routing key (routes back to push.queue)
		false,                 // Mandatory
		false,                 // Immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        newBody,
			// Production Change: For exponential backoff, a separate dedicated retry queue
			// with increasing TTL headers should be used here instead of directly to push.queue.
		},
	)
	
	if publishErr != nil {
		fmt.Printf("CRITICAL: Failed to re-publish message for retry: %v. Rejecting permanently.\n", publishErr)
		d.Reject(false)
		return
	}
	
	// Acknowledge the original delivery since we successfully published the updated copy.
	// Remove the idempotency key so the retried message can be processed again.
	if _, delErr := w.RedisClient.Del(ctx, "push:processed:"+job.RequestID).Result(); delErr != nil {
		fmt.Printf("Warning: failed to remove idempotency key for %s: %v\n", job.RequestID, delErr)
	}

	d.Ack(false)
}

// fetchUserData mocks the synchronous REST call to the User Service.
func (w *PushWorker) fetchUserData(userID string) (models.UserData, error) {
	// Production Note: Use the dedicated HTTP client, potentially wrapped with the circuit breaker
	// to protect against a User Service failure.
	url := fmt.Sprintf("%s/%s", w.UserServiceURL, userID)
	resp, err := w.HTTPClient.Get(url)
	if err != nil {
		return models.UserData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return models.UserData{}, fmt.Errorf("user service returned status %d", resp.StatusCode)
	}

	var apiResp models.StandardizedResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		// Production Change: This is likely a permanent parsing failure.
		return models.UserData{}, fmt.Errorf("failed to decode user service response: %w", err)
	}

	if !apiResp.Success || apiResp.Data == nil {
		return models.UserData{}, fmt.Errorf("user service failed: %s", apiResp.Message)
	}
	
	dataBytes, _ := json.Marshal(apiResp.Data)
	var userData models.UserData
	if err := json.Unmarshal(dataBytes, &userData); err != nil {
		// Production Change: The payload structure didn't match the expected model. Permanent error.
		return models.UserData{}, fmt.Errorf("failed to parse user data payload: %w", err)
	}

	if userData.PushToken == "" {
		// Log and treat this as a successful "no-op" or permanent user preference issue.
		return models.UserData{}, fmt.Errorf("user has no push token; skipping delivery")
	}
	return userData, nil
}

// fetchTemplateData mocks the synchronous REST call to the Template Service.
func (w *PushWorker) fetchTemplateData(templateID string) (models.TemplateData, error) {
	url := fmt.Sprintf("%s/%s", w.TemplateServiceURL, templateID)
	resp, err := w.HTTPClient.Get(url)
	if err != nil {
		return models.TemplateData{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return models.TemplateData{}, fmt.Errorf("template service returned status %d", resp.StatusCode)
	}
	
	var apiResp models.StandardizedResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return models.TemplateData{}, fmt.Errorf("failed to decode template service response: %w", err)
	}

	if !apiResp.Success || apiResp.Data == nil {
		return models.TemplateData{}, fmt.Errorf("template service failed: %s", apiResp.Message)
	}

	dataBytes, _ := json.Marshal(apiResp.Data)
	var templateData models.TemplateData
	if err := json.Unmarshal(dataBytes, &templateData); err != nil {
		return models.TemplateData{}, fmt.Errorf("failed to parse template data payload: %w", err)
	}

	return templateData, nil
}

// renderTemplate fills the variables into the template strings.
func (w *PushWorker) renderTemplate(data models.TemplateData, variables map[string]string) (title string, body string, err error) {
	
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