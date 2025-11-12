# Production Deployment Guide

## Overview

This guide covers deploying the Notification System microservices (Template Service, Email Service, and API Gateway) to production.

## Prerequisites

- Docker and Docker Compose installed on production server
- PostgreSQL, Redis, and RabbitMQ (or use Docker Compose)
- Domain name and SSL certificates (for HTTPS)
- Environment variables configured
- SSH access to production server

## Deployment Options

### Option 1: Docker Compose (Recommended for Single Server)

1. **Clone repository on production server:**
   ```bash
   git clone <your-repo-url> /opt/notification-system
   cd /opt/notification-system
   ```

2. **Create production environment file:**
   ```bash
   cp .env.production.example .env.production
   # Edit .env.production with production values
   ```

3. **Start services:**
   ```bash
   docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```

4. **Run database migrations:**
   ```bash
   docker-compose -f docker-compose.prod.yml exec template-service npm run migration:run
   ```

5. **Verify services:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   curl http://localhost:3003/health
   ```

### Option 2: Individual Docker Containers

Build and run each service separately:

```bash
# Build images
docker build -t template-service:latest ./template\ service
docker build -t email-service:latest ./Email\ service
docker build -t api-gateway:latest ./API\ Gateway\ service

# Run with docker run or docker-compose
```

### Option 3: Kubernetes (For Multi-Server/Scaling)

Create Kubernetes manifests for:
- Deployments for each service
- Services for internal/external access
- ConfigMaps for configuration
- Secrets for sensitive data
- Ingress for API Gateway

## Environment Variables

Create `.env.production` file with:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<strong-password>
POSTGRES_DB=template_service

# Redis
REDIS_PASSWORD=<strong-password>

# RabbitMQ
RABBITMQ_USER=admin
RABBITMQ_PASSWORD=<strong-password>

# SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Notification System <noreply@yourdomain.com>"

# External Services
USER_SERVICE_URL=http://user-service:3002

# API Gateway
GATEWAY_PORT=3003
```

## CI/CD Setup

### GitHub Actions Secrets

Configure these secrets in GitHub repository settings:

- `DOCKER_REGISTRY` - Docker registry URL (e.g., `docker.io` or `ghcr.io`)
- `DOCKER_USERNAME` - Docker registry username
- `DOCKER_PASSWORD` - Docker registry password/token
- `SERVER_HOST` - Production server IP/hostname
- `SERVER_USER` - SSH username
- `SERVER_SSH_KEY` - SSH private key for deployment

### Deployment Flow

1. **Push to main branch** → Triggers CI workflow
2. **CI runs** → Lint, test, build Docker images
3. **Deploy workflow** → Builds and pushes images to registry
4. **SSH to server** → Pulls latest images and restarts services

## Health Checks

All services expose `/health` endpoints:

- Template Service: `http://localhost:3000/health`
- Email Service: `http://localhost:3001/health`
- API Gateway: `http://localhost:3003/health`

## Scaling

### Horizontal Scaling

Scale services independently:

```bash
docker-compose -f docker-compose.prod.yml up -d --scale email-service=3
docker-compose -f docker-compose.prod.yml up -d --scale api-gateway=2
```

### Load Balancing

Use a reverse proxy (nginx/traefik) in front of API Gateway:

```nginx
upstream api_gateway {
    server api-gateway-1:3003;
    server api-gateway-2:3003;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://api_gateway;
    }
}
```

## Monitoring

- **Health Checks**: Use `/health` endpoints for monitoring
- **Logs**: `docker-compose logs -f <service-name>`
- **Metrics**: Consider adding Prometheus/Grafana
- **Error Tracking**: Integrate Sentry or similar

## Database Migrations

Run migrations before starting services:

```bash
docker-compose -f docker-compose.prod.yml exec template-service npm run migration:run
```

## Rollback

To rollback to previous version:

```bash
docker-compose -f docker-compose.prod.yml pull template-service:<previous-tag>
docker-compose -f docker-compose.prod.yml up -d template-service
```

## Security Checklist

- [ ] Use strong passwords for all services
- [ ] Enable SSL/TLS (HTTPS)
- [ ] Restrict database access (no public ports)
- [ ] Use secrets management (not plain .env files)
- [ ] Enable firewall rules
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity

## Troubleshooting

### Service won't start
- Check logs: `docker-compose logs <service-name>`
- Verify environment variables
- Check health of dependencies (PostgreSQL, Redis, RabbitMQ)

### Database connection issues
- Verify PostgreSQL is running and accessible
- Check credentials in environment variables
- Ensure network connectivity between containers

### Queue not processing
- Check RabbitMQ management UI: `http://server:15672`
- Verify queue bindings
- Check service logs for errors

