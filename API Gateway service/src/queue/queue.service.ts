import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { Channel, Options } from 'amqplib';

export interface NotificationQueuePayload {
  notification_id: string;
  user_id: string;
  template_code: string;
  variables: Record<string, unknown>;
  priority?: number;
  language?: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;
  private readonly exchange: string;
  private readonly emailQueue: string;
  private readonly pushQueue: string;
  private connected = false;

  constructor(private readonly config: ConfigService) {
    this.exchange = this.config.get<string>(
      'RABBITMQ_EXCHANGE',
      'notifications.direct',
    );
    this.emailQueue = this.config.get<string>('EMAIL_QUEUE', 'email.queue');
    this.pushQueue = this.config.get<string>('PUSH_QUEUE', 'push.queue');
  }

  onModuleInit() {
    const rabbitUrl = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );

    this.connection = amqp.connect([rabbitUrl]);
    this.connection.on('connect', () => {
      this.connected = true;
      this.logger.log('RabbitMQ connected');
    });
    this.connection.on('disconnect', (e) => {
      this.connected = false;
      this.logger.warn(`RabbitMQ disconnected: ${e?.err?.message ?? ''}`);
    });

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        // Assert exchange

        await channel.assertExchange(this.exchange, 'direct', {
          durable: true,
        });

        // Assert queues

        await channel.assertQueue(this.emailQueue, { durable: true });

        await channel.assertQueue(this.pushQueue, { durable: true });

        // Bind queues to exchange

        await channel.bindQueue(
          this.emailQueue,
          this.exchange,
          this.emailQueue,
        );

        await channel.bindQueue(this.pushQueue, this.exchange, this.pushQueue);

        this.logger.log(`Exchange '${this.exchange}' and queues asserted`);
      },
    });
  }

  async publishNotification(
    payload: NotificationQueuePayload,
    notificationType: 'email' | 'push',
  ): Promise<void> {
    const queueName =
      notificationType === 'email' ? this.emailQueue : this.pushQueue;
    const routingKey = queueName;

    try {
      const publishOptions: Options.Publish = { deliveryMode: 2 };
      const publisher = this.channelWrapper as unknown as {
        publish: (
          exchange: string,
          routingKey: string,
          content: unknown,
          options?: Options.Publish,
        ) => Promise<void>;
      };
      await publisher.publish(
        this.exchange,
        routingKey,
        payload,
        publishOptions,
      );
      this.logger.debug(
        `Published notification ${payload.notification_id} to ${queueName}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish notification to ${queueName}`,
        error,
      );
      throw error;
    }
  }

  async publishToQueue(queueName: string, payload: unknown): Promise<void> {
    try {
      const publishOptions: Options.Publish = { deliveryMode: 2 };
      const publisher = this.channelWrapper as unknown as {
        publish: (
          exchange: string,
          routingKey: string,
          content: unknown,
          options?: Options.Publish,
        ) => Promise<void>;
      };
      await publisher.publish(
        this.exchange,
        queueName,
        payload,
        publishOptions,
      );
      this.logger.debug(`Published message to ${queueName}`);
    } catch (error) {
      this.logger.error(`Failed to publish to ${queueName}`, error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async onModuleDestroy() {
    await this.channelWrapper?.close();
    await this.connection?.close();
    this.connected = false;
  }
}
