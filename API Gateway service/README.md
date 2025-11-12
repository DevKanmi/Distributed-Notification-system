<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

API Gateway Service for the Distributed Notification System. This microservice serves as the single entry point for all notification requests, validating incoming requests, routing them to appropriate queues (email or push), and tracking notification status.

## Features

- **Request Validation**: Validates and authenticates all incoming notification requests
- **Queue Routing**: Routes messages to appropriate RabbitMQ queues (email.queue or push.queue)
- **Status Tracking**: Tracks notification status via Redis and RabbitMQ status events
- **Idempotency**: Prevents duplicate notifications using request_id with Redis
- **Health Checks**: Comprehensive health endpoint checking RabbitMQ and Redis connections
- **API Documentation**: Swagger/OpenAPI documentation at `/docs`

## Project setup

```bash
$ npm install
$ cp env.example .env
# Edit .env with your configuration
```

## Environment Variables

See `env.example` for all required environment variables:
- `PORT`: Server port (default: 3003)
- `RABBITMQ_URL`: RabbitMQ connection string
- `RABBITMQ_EXCHANGE`: Exchange name (default: notifications.direct)
- `EMAIL_QUEUE`, `PUSH_QUEUE`: Queue names for routing
- `STATUS_QUEUE`, `STATUS_ROUTING_KEY`: Status event queue configuration
- `REDIS_HOST`, `REDIS_PORT`: Redis connection details
- `IDEMPOTENCY_TTL_SECONDS`: TTL for idempotency keys (default: 86400)

## Infrastructure Setup

Start RabbitMQ and Redis using Docker Compose:

```bash
$ docker-compose up -d
```

This will start:
- Redis on port 6379
- RabbitMQ on port 5672 (management UI on port 15672)

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## API Documentation

Once running, visit `http://localhost:3003/docs` for Swagger API documentation.

## API Endpoints

### Create Notification
```http
POST /api/v1/notifications/
Content-Type: application/json

{
  "notification_type": "email",
  "user_id": "uuid",
  "template_code": "welcome_email",
  "variables": { "name": "John" },
  "request_id": "optional-uuid",
  "priority": 5,
  "language": "en"
}
```

### Get Notification Status
```http
GET /api/v1/notifications/:notification_id/status
```

### Health Check
```http
GET /health
```

## Response Format

All responses follow the standard format:
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... },
  "error": null
}
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
