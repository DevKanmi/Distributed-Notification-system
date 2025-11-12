/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import CircuitBreaker from 'opossum';
import Redis from 'ioredis';
import { UserServiceClient } from './user-service.client';
import { TemplateServiceClient } from './template-service.client';
import { StatusService } from './status.service';

export interface EmailQueuePayload {
  notification_id: string;
  user_id: string;
  template_code: string;
  variables: Record<string, unknown>;
  priority?: number;
  language?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private smtpCircuitBreaker: CircuitBreaker<
    [{ to: string; subject: string; html: string }],
    void
  >;

  constructor(
    private readonly config: ConfigService,
    private readonly userService: UserServiceClient,
    private readonly templateService: TemplateServiceClient,
    private readonly statusService: StatusService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: parseInt(this.config.get<string>('SMTP_PORT', '1025'), 10),
      secure: this.config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: this.config.get('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS'),
          }
        : undefined,
    });

    const options = {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    };

    this.smtpCircuitBreaker = new CircuitBreaker(
      this.sendEmailInternal.bind(this),
      options,
    );

    this.smtpCircuitBreaker.on('open', () => {
      this.logger.warn('Circuit breaker opened for SMTP');
    });
  }

  async process(payload: EmailQueuePayload): Promise<void> {
    // Check idempotency
    const idempotencyKey = `processed:${payload.notification_id}`;
    const alreadyProcessed = await this.redis.get(idempotencyKey);
    if (alreadyProcessed) {
      this.logger.warn(
        `Notification ${payload.notification_id} already processed, skipping`,
      );
      return;
    }

    try {
      // Publish pending status
      await this.statusService.publishStatus({
        notification_id: payload.notification_id,
        status: 'pending',
        timestamp: new Date().toISOString(),
        service: 'email',
      });

      // 1. Get user data
      const user = await this.userService.getUser(payload.user_id);

      // Check user preferences
      if (user.preferences?.email === false) {
        this.logger.warn(
          `User ${payload.user_id} has disabled email notifications`,
        );
        await this.statusService.publishStatus({
          notification_id: payload.notification_id,
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: 'User has disabled email notifications',
          service: 'email',
        });
        return;
      }

      const language = payload.language ?? user.language ?? 'en';

      // 2. Get rendered template
      const template = await this.templateService.getRenderedTemplate(
        payload.template_code,
        language,
        payload.variables,
      );

      // 3. Send email (with circuit breaker)
      await this.smtpCircuitBreaker.fire({
        to: user.email,
        subject: template.rendered_subject,
        html: template.rendered_body,
      });

      // Mark as processed (24 hour TTL)
      await this.redis.setex(idempotencyKey, 86400, '1');

      // Publish delivered status
      await this.statusService.publishStatus({
        notification_id: payload.notification_id,
        status: 'delivered',
        timestamp: new Date().toISOString(),
        service: 'email',
      });

      this.logger.log(
        `Sent email notification ${payload.notification_id} to ${user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process notification ${payload.notification_id}`,
        error,
      );

      // Publish failed status
      await this.statusService.publishStatus({
        notification_id: payload.notification_id,
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        service: 'email',
      });

      throw error; // Re-throw for retry logic
    }
  }

  private async sendEmailInternal(mailOptions: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from:
        this.config.get<string>(
          'SMTP_FROM',
          'Template Service <no-reply@example.com>',
        ) ?? undefined,
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
    });
  }

  isSmtpCircuitOpen(): boolean {
    return this.smtpCircuitBreaker.opened;
  }
}

