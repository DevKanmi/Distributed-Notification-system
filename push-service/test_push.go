package main

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/streadway/amqp"
)

// PushNotificationJob structure, matching push_service/models.go
type PushNotificationJob struct {
	RequestID     string            `json:"request_id"`
	UserID        string            `json:"user_id"`
	TemplateID    string            `json:"template_id"`
	Variables     map[string]string `json:"variables"`
	CorrelationID string            `json:"correlation_id"`
	RetryCount    int               `json:"retry_count"`
}

// RabbitMQ configuration values used by the push_service
const (
	RABBITMQ_URL = "amqp://guest:guest@localhost:5672/" 
	EXCHANGE     = "notifications.direct"
	ROUTING_KEY  = "push.queue" // The key that routes to your worker's queue
)

func failOnError(err error, msg string) {
	if err != nil {
		fmt.Printf("%s: %v\n", msg, err)
		os.Exit(1)
	}
}

func main() {
	fmt.Println("Attempting to connect to RabbitMQ...")
	conn, err := amqp.Dial(RABBITMQ_URL)
	failOnError(err, "Failed to connect to RabbitMQ")
	defer conn.Close()

	ch, err := conn.Channel()
	failOnError(err, "Failed to open a channel")
	defer ch.Close()

	// Ensure the exchange is declared, just like in push_service/main.go
	err = ch.ExchangeDeclare(EXCHANGE, "direct", true, false, false, false, nil)
	failOnError(err, "Failed to declare exchange")
	
	// --- 1. Construct the Test Payload ---
	requestID := uuid.New().String()
	
	job := PushNotificationJob{
		RequestID:    requestID,
		UserID:       "u-789-finance", // Mock User ID (your worker will try to fetch data for this ID)
		TemplateID:   "payment_received_alert",
		Variables: map[string]string{
			"name":     "Dev Team",
			"amount":   "99.99",
			"currency": "USD",
		},
		CorrelationID: fmt.Sprintf("TEST-PROD-%d", time.Now().Unix()),
		RetryCount:    0,
	}

	body, err := json.Marshal(job)
	failOnError(err, "Failed to marshal JSON payload")

	// --- 2. Publish the Message ---
	err = ch.Publish(
		EXCHANGE,   // exchange
		ROUTING_KEY, // routing key
		false,      // mandatory
		false,      // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
			DeliveryMode: amqp.Persistent, // Ensure message survives broker restart
		})

	failOnError(err, "Failed to publish message")

	fmt.Printf(" [x] Successfully sent Push Job to queue:\n")
	fmt.Printf("     - Request ID: %s\n", requestID)
	fmt.Printf("     - Routing Key: %s\n", ROUTING_KEY)
	
	// --- 3. Test Idempotency (Optional) ---
	// If you run this file multiple times quickly, the push_service/worker.go 
	// should log a successful delivery only on the first run, and log 
	// "Acknowledging duplicate" on subsequent runs for the same job.
	if len(os.Args) > 1 && os.Args[1] == "duplicate" {
		fmt.Println("\n--- Publishing duplicate job to test Idempotency ---")
		job.RequestID = requestID // Reuse the same ID
		duplicateBody, _ := json.Marshal(job)
		
		err = ch.Publish(EXCHANGE, ROUTING_KEY, false, false, amqp.Publishing{
			ContentType: "application/json",
			Body:        duplicateBody,
			DeliveryMode: amqp.Persistent,
		})
		failOnError(err, "Failed to publish duplicate message")
		fmt.Printf(" [x] Sent DUPLICATE Job with Request ID: %s\n", requestID)
	}
}