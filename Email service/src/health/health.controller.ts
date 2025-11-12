import { Controller, Get, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { firstValueFrom } from 'rxjs';
import { UserServiceClient } from '../services/user-service.client';
import { TemplateServiceClient } from '../services/template-service.client';
import { EmailService } from '../services/email.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly userService: UserServiceClient,
    private readonly templateService: TemplateServiceClient,
    private readonly emailService: EmailService,
  ) {}

  @Get()
  async getHealth() {
    const checks: Record<string, string> = {};

    // Check Redis
    try {
      await this.redis.ping();
      checks.redis = 'up';
    } catch (error) {
      checks.redis = 'down';
    }

    // Check User Service
    try {
      const userServiceUrl = this.config.get<string>(
        'USER_SERVICE_URL',
        'http://localhost:3002',
      );
      await firstValueFrom(
        this.http.get(`${userServiceUrl}/health`, { timeout: 3000 }),
      );
      checks.user_service = 'up';
    } catch (error) {
      checks.user_service = this.userService.isCircuitOpen()
        ? 'circuit_open'
        : 'down';
    }

    // Check Template Service
    try {
      const templateServiceUrl = this.config.get<string>(
        'TEMPLATE_SERVICE_URL',
        'http://localhost:3000',
      );
      await firstValueFrom(
        this.http.get(`${templateServiceUrl}/health`, { timeout: 3000 }),
      );
      checks.template_service = 'up';
    } catch (error) {
      checks.template_service = this.templateService.isCircuitOpen()
        ? 'circuit_open'
        : 'down';
    }

    // Check SMTP (circuit breaker status)
    checks.smtp = this.emailService.isSmtpCircuitOpen()
      ? 'circuit_open'
      : 'up';

    const isHealthy = Object.values(checks).every(
      (v) => v === 'up' || v === 'circuit_open',
    );

    return {
      success: isHealthy,
      message: isHealthy
        ? 'All systems operational'
        : 'Some systems down',
      data: {
        status: isHealthy ? 'healthy' : 'degraded',
        checks,
      },
    };
  }
}




