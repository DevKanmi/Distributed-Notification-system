Perfect 👍🏽 — here’s your **customized team version** of the `README.md`, updated with your **GitHub repository link**, **contributor section**, and minor professional polish to make it “deployment-ready.”
You can copy this directly into your project root as `README.md`.

---

````markdown
# 🧑‍💻 User Service — Distributed Notification System

This **User Service** is a microservice built with **NestJS**, **PostgreSQL**, and **Redis** as part of the [**Distributed Notification System**](https://github.com/DevKanmi/Distributed-Notification-system) project.

It handles:
- Authentication  
- User profile management  
- Push token management  
- Notification preferences  
- Health monitoring and caching with Redis  

---

## 🚀 Features

- 🔐 JWT-based authentication  
- 👤 User management (CRUD)  
- 📱 Push token management for device notifications  
- 🔔 Notification preferences storage  
- 🧠 Redis caching for faster responses  
- ❤️ Health check endpoint for service diagnostics  

---

## 🧱 Tech Stack

| Tool | Purpose |
|------|----------|
| **NestJS** | Application framework |
| **PostgreSQL** | Relational database |
| **Redis** | Caching layer |
| **TypeORM** | ORM for database management |
| **Docker** | Containerization |
| **JWT** | Authentication |
| **TypeScript** | Primary language |

---

## ⚙️ Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# Database configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password_here
DATABASE_NAME=user_service_db

# JWT secret
JWT_SECRET=your_jwt_secret_here

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
````

> ⚠️ Never commit your real `.env` file to GitHub.
> Only `.env.example` should be pushed.

---

## 🐳 Running the Project with Docker

### 1️⃣ Start PostgreSQL and Redis containers

```bash
docker-compose up -d
```

### 2️⃣ Install dependencies and start the service

```bash
npm install
npm run start:dev
```

### 3️⃣ Or build and run with Docker

```bash
docker build -t user-service .
docker run -p 3000:3000 --env-file .env user-service
```

---

## 🧭 API Endpoints Overview

### 🔐 Authentication

| Method | Endpoint         | Description                      |
| ------ | ---------------- | -------------------------------- |
| `POST` | `/auth/register` | Register a new user              |
| `POST` | `/auth/login`    | Authenticate and get JWT token   |
| `POST` | `/auth/logout`   | Logout user (invalidate session) |

---

### 👤 Users

| Method  | Endpoint     | Description         |
| ------- | ------------ | ------------------- |
| `GET`   | `/users`     | Retrieve all users  |
| `GET`   | `/users/:id` | Get user by ID      |
| `PATCH` | `/users/:id` | Update user profile |

> Requires Bearer Token authentication.

---

### 📱 Push Tokens

| Method   | Endpoint                          | Description                    |
| -------- | --------------------------------- | ------------------------------ |
| `GET`    | `/users/:id/push-tokens`          | Get all push tokens for a user |
| `POST`   | `/users/:id/push-tokens`          | Add a push token               |
| `DELETE` | `/users/:id/push-tokens/:tokenId` | Remove a specific push token   |

---

### 🔔 Preferences

| Method  | Endpoint                 | Description             |
| ------- | ------------------------ | ----------------------- |
| `GET`   | `/users/:id/preferences` | Get user preferences    |
| `PATCH` | `/users/:id/preferences` | Update user preferences |

---

### ❤️ Health Check

| Method | Endpoint  | Description                           |
| ------ | --------- | ------------------------------------- |
| `GET`  | `/health` | Check API, database, and Redis status |

**Example Response:**

```json
{
  "status": "ok✅",
  "service": "user-service",
  "timestamp": "2025-11-13T16:55:28.309Z",
  "checks": {
    "database": "up",
    "redis": "up"
  }
}
```

---

## 🧠 Redis Caching

User data and sessions are automatically cached for performance.
Each user record is stored in Redis using this key pattern:

```
user:{userId}
```

To verify the cache manually:

```bash
docker exec -it redis-dev redis-cli
keys *
```

---

## 🧰 Development Commands

| Command              | Description               |
| -------------------- | ------------------------- |
| `npm run start:dev`  | Start in development mode |
| `npm run build`      | Build for production      |
| `npm run start:prod` | Start production build    |
| `npm run lint`       | Run ESLint                |
| `npm run test`       | Run test suite            |

---

## 🧑‍🤝‍🧑 Contributors

| Name                 | Role                             | GitHub                                           |
| -------------------- | -------------------------------- | ------------------------------------------------ |
| **Patrick**          | Backend Developer (User Service) | [@yourusername](https://github.com/yourusername) |
| **DevKanmi**         | Project Lead                     | [@DevKanmi](https://github.com/DevKanmi)         |
| *Other team members* | —                                | —                                                |

> Want to contribute? Fork the repo and submit a PR!

---

## 🔗 Repository

📦 GitHub: [Distributed Notification System](https://github.com/DevKanmi/Distributed-Notification-system)

---

## 📄 License

Licensed under the **MIT License**.

---

## 🩵 Maintained By

**Team Distributed Notification System**
Building scalable backend systems for real-time notifications.

```

---