import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';
import Redis from 'ioredis';
import { EmailService } from '../services/email.service';
import { TemplateServiceClient } from '../services/template-service.client';

interface MessageMetadata {
  retryCount: number;
  firstAttempt: number;
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // Exponential backoff in ms

  constructor(
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateServiceClient,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  async onModuleInit() {
    const rabbitUrl = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );
    const queue = this.config.get<string>('EMAIL_QUEUE', 'email.queue');
    const dlq = `${queue}.failed`;
    const exchange = this.config.get<string>(
      'STATUS_EXCHANGE',
      'notifications.direct',
    );

    this.connection = amqp.connect([rabbitUrl]);
    this.connection.on('connect', () => this.logger.log('RabbitMQ connected'));
    this.connection.on('disconnect', (e) =>
      this.logger.warn(`RabbitMQ disconnected: ${e?.err?.message ?? ''}`),
    );

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        await channel.assertExchange(exchange, 'direct', { durable: true });
        await channel.assertQueue(queue, { durable: true });
        await channel.assertQueue(dlq, { durable: true });
        await channel.bindQueue(queue, exchange, queue);

        // Listen for template.updated events
        const templateUpdateQueue = 'email_service_template_updates';
        await channel.assertQueue(templateUpdateQueue, { durable: true });
        await channel.bindQueue(
          templateUpdateQueue,
          exchange,
          'template.updated',
        );

        await channel.consume(
          queue,
          (msg: ConsumeMessage | null) => this.consume(msg, channel),
          {
            noAck: false,
          },
        );

        await channel.consume(
          templateUpdateQueue,
          (msg: ConsumeMessage | null) =>
            this.handleTemplateUpdate(msg, channel),
          { noAck: false },
        );

        this.logger.log(`Consuming from queue ${queue}`);
        this.logger.log(`Listening for template updates on ${templateUpdateQueue}`);
      },
    });
  }

  private async consume(msg: ConsumeMessage | null, channel: Channel) {
    if (!msg) return;

    const payload = JSON.parse(msg.content.toString());
    const notificationId = payload.notification_id;
    const retryKey = `retry:${notificationId}`;

    try {
      // Get retry metadata
      const retryData = await this.getRetryMetadata(retryKey);
      const retryCount = retryData.retryCount || 0;

      if (retryCount >= this.maxRetries) {
        this.logger.error(
          `Max retries exceeded for ${notificationId}, moving to DLQ`,
        );
        await this.moveToDLQ(channel, msg, payload);
        channel.ack(msg);
        return;
      }

      // Process email
      await this.emailService.process(payload);
      await this.redis.del(retryKey);
      channel.ack(msg);
    } catch (err) {
      const retryData = await this.getRetryMetadata(retryKey);
      const retryCount = (retryData.retryCount || 0) + 1;

      if (retryCount >= this.maxRetries) {
        this.logger.error(
          `Max retries exceeded for ${notificationId}, moving to DLQ`,
        );
        await this.moveToDLQ(channel, msg, payload);
        channel.ack(msg);
        return;
      }

      // Schedule retry with exponential backoff
      const delay = this.retryDelays[retryCount - 1] || 8000;
      await this.redis.setex(
        retryKey,
        3600,
        JSON.stringify({
          retryCount,
          firstAttempt: retryData.firstAttempt || Date.now(),
        }),
      );

      this.logger.warn(
        `Retry ${retryCount}/${this.maxRetries} for ${notificationId} after ${delay}ms`,
      );

      // Reject and requeue with delay
      setTimeout(() => {
        channel.nack(msg, false, true);
      }, delay);
    }
  }

  private async handleTemplateUpdate(
    msg: ConsumeMessage | null,
    channel: Channel,
  ) {
    if (!msg) return;

    try {
      const event = JSON.parse(msg.content.toString());
      if (event.template_code && event.language) {
        await this.templateService.invalidateCache(
          event.template_code,
          event.language,
        );
        this.logger.debug(
          `Invalidated cache for ${event.template_code}:${event.language}`,
        );
      }
      channel.ack(msg);
    } catch (err) {
      this.logger.error('Failed to handle template update', err);
      channel.nack(msg, false, true);
    }
  }

  private async getRetryMetadata(
    retryKey: string,
  ): Promise<MessageMetadata> {
    try {
      const data = await this.redis.get(retryKey);
      return data ? JSON.parse(data) : { retryCount: 0, firstAttempt: Date.now() };
    } catch {
      return { retryCount: 0, firstAttempt: Date.now() };
    }
  }

  private async moveToDLQ(
    channel: Channel,
    msg: ConsumeMessage,
    payload: unknown,
  ) {
    const dlq = `${this.config.get<string>('EMAIL_QUEUE', 'email.queue')}.failed`;
    try {
      await channel.sendToQueue(dlq, Buffer.from(JSON.stringify(payload)), {
        persistent: true,
      });
      this.logger.warn(`Moved message to DLQ: ${dlq}`);
    } catch (err) {
      this.logger.error('Failed to move message to DLQ', err);
    }
  }
}