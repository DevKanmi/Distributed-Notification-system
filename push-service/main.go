package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/streadway/amqp"
)

// RabbitMQ connection setup. In a real environment, this should be in a config file.
const (
	RabbitMQURL = "amqp://guest:guest@localhost:5672/"
	RedisAddr   = "localhost:6379"
	QueueName   = "push.queue"
	DLXName     = "notifications.dlx"
	ExchangeName = "notifications.direct"
)

func main() {
	rdb := redis.NewClient(&redis.Options{
		Addr: RedisAddr,
	})

	if _, err := rdb.Ping(rdb.Context()).Result(); err != nil {
		fmt.Printf("Could not connect to Redis: %v. Exiting.\n", err)
		os.Exit(1)
	}
	fmt.Println("Connected to Redis successfully.")

	conn, err := amqp.Dial(RabbitMQURL)
	if err != nil {
		fmt.Printf("Failed to connect to RabbitMQ: %v. Exiting.\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	ch, err := conn.Channel()
	if err != nil {
		fmt.Printf("Failed to open a channel: %v. Exiting.\n", err)
		os.Exit(1)
	}
	defer ch.Close()
	err = ch.ExchangeDeclare(ExchangeName, "direct", true, false, false, false, nil)
	if err != nil {
		fmt.Printf("Failed to declare exchange: %v. Exiting.\n", err)
		os.Exit(1)
	}

	_, err = ch.QueueDeclare("failed.queue", true, false, false, false, nil)
	if err != nil {
		fmt.Printf("Failed to declare failed.queue: %v. Exiting.\n", err)
		os.Exit(1)
	}
	ch.QueueBind("failed.queue", "failed", ExchangeName, false, nil)
	
	// Use Push Queue with DLX configuration
	// For ease, I'm not creating a retry queue here, I'm relying on the main DLX setup.
	args := amqp.Table{
		"x-dead-letter-exchange": DLXName, // Messages rejected from push.queue go to DLX

	}

	q, err := ch.QueueDeclare(QueueName, true, false, false, false, args)
	if err != nil {
		fmt.Printf("Failed to declare queue %s: %v. Exiting.\n", QueueName, err)
		os.Exit(1)
	}
	ch.QueueBind(q.Name, "push.queue", ExchangeName, false, nil)
	
	// Quality of Service to single time
	err = ch.Qos(1, 0, false)
	if err != nil {
		fmt.Printf("Failed to set QoS: %v. Exiting.\n", err)
		os.Exit(1)
	}
	msgs, err := ch.Consume(
		q.Name, // queue
		"",     // consumer
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

	worker := NewPushWorker(ch, rdb)
	
	// Start the message processing loop in a goroutine
	go func() {
		fmt.Println("Push Notification Worker is running and listening for messages...")
		for d := range msgs {
			// This starts a goroutine for every message!
			// This is Go's superpower for horizontal scaling within a single process.
			go worker.ProcessMessage(d)
		}
	}()

	// --- 5. Graceful Shutdown ---
	// Wait for a termination signal (Ctrl+C or kill)
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("Shutting down worker gracefully...")
	// Wait a moment for any active goroutines to finish (optional, but good practice)
	time.Sleep(2 * time.Second) 
	fmt.Println("Push Service stopped.")
}