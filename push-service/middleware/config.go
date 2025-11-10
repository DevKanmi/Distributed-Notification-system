package middleware

import (
	"fmt"
	"os"
	"time"
)

type Config struct {
	RabbitMQURL        string
	RedisAddr          string
	QueueName          string
	DLXName            string
	ExchangeName       string
	UserServiceURL     string
	TemplateServiceURL string
	MaxRetries         int
	IdempotencyTTL     time.Duration
}

func LoadConfig() Config {
	getEnv := func(key, defaultValue string) string {
		if value, exists := os.LookupEnv(key); exists {
			return value
		}
		return defaultValue
	}

	return Config{
		RabbitMQURL:        getEnv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
		RedisAddr:          getEnv("REDIS_ADDR", "localhost:6379"),
		QueueName:          getEnv("PUSH_QUEUE_NAME", "push.queue"),
		DLXName:            getEnv("NOTIFICATION_DLX_NAME", "notifications.dlx"),
		ExchangeName:       getEnv("NOTIFICATION_EXCHANGE", "notifications.direct"),
		// I'm using a inter-service REST communication. kind of following container/service names
		UserServiceURL:     getEnv("USER_SERVICE_URL", "http://user-service:8081/api/v1/users"),
		TemplateServiceURL: getEnv("TEMPLATE_SERVICE_URL", "http://template-service:8082/api/v1/templates"),
		MaxRetries:         5, 
		IdempotencyTTL:     7 * 24 * time.Hour,
	}
}

func (c Config) Print() {
	fmt.Println("--- Push Service Configuration ---")
	fmt.Printf("RabbitMQ URL (host only): %s\n", c.RabbitMQURL) 
	fmt.Printf("Redis Address: %s\n", c.RedisAddr)
	fmt.Printf("User Service URL: %s\n", c.UserServiceURL)
	fmt.Printf("Template Service URL: %s\n", c.TemplateServiceURL)
	fmt.Printf("Max Retries: %d\n", c.MaxRetries)
	fmt.Println("----------------------------------")
}