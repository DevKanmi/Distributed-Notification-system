package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	firebase "firebase.google.com/go"
	// "firebase.google.com/go/messaging"
	"github.com/go-redis/redis/v8"
	"github.com/streadway/amqp"
	"google.golang.org/api/option"
	"github.com/ezrahel/middleware"
)

func main() {
	// --- Load Configuration ---
	cfg := middleware.LoadConfig()
	cfg.Print() // Log configuration at startup
	ctx := context.Background()

	// --- 1. Connect to Redis ---
	rdb := redis.NewClient(&redis.Options{
		Addr: cfg.RedisAddr,
	})

	if _, err := rdb.Ping(ctx).Result(); err != nil {
		fmt.Printf("Could not connect to Redis: %v. Exiting.\n", err)
		os.Exit(1)
	}
	fmt.Println("Connected to Redis successfully.")

	// --- 2. Initialize Firebase FCM Client ---
	// Authentication is handled via the credentials path specified in config.go
	opt := option.WithCredentialsFile(cfg.FirebaseCredentialsPath)
	app, err := firebase.NewApp(ctx, nil, opt)
	if err != nil {
		fmt.Printf("Failed to initialize Firebase App: %v. Check FIREBASE_CREDENTIALS_PATH.\n", err)
		os.Exit(1)
	}
	
	fcmClient, err := app.Messaging(ctx)
	if err != nil {
		fmt.Printf("Failed to get FCM client: %v. Exiting.\n", err)
		os.Exit(1)
	}
	fmt.Println("Firebase FCM client initialized successfully.")
	

	// --- 3. Connect to RabbitMQ ---
	conn, err := amqp.Dial(cfg.RabbitMQURL)
	if err != nil {
		fmt.Printf("Failed to connect to RabbitMQ: %v. Exiting.\n", err)
		os.Exit(1)
	}
	// Defer closing connection only after consumer is established
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		fmt.Printf("Failed to open a channel: %v. Exiting.\n", err)
		os.Exit(1)
	}
	defer ch.Close()

	// --- 4. Declare Topology (RabbitMQ Setup) ---
	
	// Declare main exchange (notifications.direct)
	err = ch.ExchangeDeclare(cfg.ExchangeName, "direct", true, false, false, false, nil)
	if err != nil {
		fmt.Printf("Failed to declare exchange: %v. Exiting.\n", err)
		os.Exit(1)
	}

	// Declare the permanent Dead Letter Queue (failed.queue)
	_, err = ch.QueueDeclare("failed.queue", true, false, false, false, nil)
	if err != nil {
		fmt.Printf("Failed to declare failed.queue: %v. Exiting.\n", err)
		os.Exit(1)
	}
	// Bind failed.queue to the exchange with routing key "failed"
	ch.QueueBind("failed.queue", "failed", cfg.ExchangeName, false, nil)
	
	// Declare the main Push Queue (push.queue) with DLX configuration
	// Messages rejected or expired here will go to the DLX (Dead Letter Exchange)
	args := amqp.Table{
		"x-dead-letter-exchange": cfg.DLXName, // This should be a separate DLX used for routing to the permanent DLQ
	}

	q, err := ch.QueueDeclare(cfg.QueueName, true, false, false, false, args)
	if err != nil {
		fmt.Printf("Failed to declare queue %s: %v. Exiting.\n", cfg.QueueName, err)
		os.Exit(1)
	}

	// Bind the queue to the exchange with routing key "push.queue"
	ch.QueueBind(q.Name, "push.queue", cfg.ExchangeName, false, nil)
	
	// Set Quality of Service (QoS)
	// Prefetch count of 1: only one unacknowledged message per consumer.
	err = ch.Qos(1, 0, false) 
	if err != nil {
		fmt.Printf("Failed to set QoS: %v. Exiting.\n", err)
		os.Exit(1)
	}

	// --- 5. Start Consumer Worker ---
	msgs, err := ch.Consume(
		q.Name, // queue
		"",     // consumer tag (auto-generated)
		false,  // auto-ack (set to false for explicit control over ACK/NACK/REJECT)
		false,  // exclusive
		false,  // no-local
		false,  // no-wait
		nil,    // args
	)
	if err != nil {
		fmt.Printf("Failed to register a consumer: %v. Exiting.\n", err)
		os.Exit(1)
	}

	// Pass the initialized FCM client to the worker
	worker := middleware.NewPushWorker(ch, rdb, fcmClient, cfg) 
	
	// Start the message processing loop in a goroutine
	// Each message consumed is handled in its own goroutine for concurrent processing.
	go func() {
		fmt.Println("Push Notification Worker is running and listening for messages...")
		for d := range msgs {
			go worker.ProcessMessage(d)
		}
	}()

	// --- 6. Graceful Shutdown ---
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("Shutting down worker gracefully...")
	ch.Close()
	time.Sleep(2 * time.Second) 
	fmt.Println("Push Service stopped.")
}