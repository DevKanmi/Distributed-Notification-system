# Build stage
FROM golang:1.24.2 AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o push-service main.go

# Final stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates

# Copy the binary from builder
COPY --from=builder /app/push-service .

# Copy Firebase credentials file
COPY israeldev-8874d-firebase-adminsdk-jisqg-64ff209a42.json .

# Expose port (if needed for health checks or admin endpoints)
EXPOSE 8080

# Run the service
CMD ["./push-service"]
