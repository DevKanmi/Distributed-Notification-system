import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { Channel } from 'amqplib';

export interface NotificationStatusEvent {
  notification_id: string;
  status: 'pending' | 'delivered' | 'failed';
  timestamp: string;
  error?: string;
  service: 'email';
}

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;
  private readonly exchange: string;
  private readonly routingKey: string;

  constructor(private readonly config: ConfigService) {
    const rabbitUrl = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );
    this.exchange = this.config.get<string>(
      'STATUS_EXCHANGE',
      'notifications.direct',
    );
    this.routingKey = this.config.get<string>(
      'STATUS_ROUTING_KEY',
      'notifications.status',
    );

    this.connection = amqp.connect([rabbitUrl]);
    this.connection.on('connect', () =>
      this.logger.log('Status service connected to RabbitMQ'),
    );

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        await channel.assertExchange(this.exchange, 'direct', {
          durable: true,
        });
        this.logger.log(`Exchange '${this.exchange}' asserted for status`);
      },
    });
  }

  async publishStatus(event: NotificationStatusEvent): Promise<void> {
    try {
      await this.channelWrapper.publish(
        this.exchange,
        this.routingKey,
        event,
        { deliveryMode: 2 }, // 2 = persistent
      );
      this.logger.debug(
        `Published status: ${event.notification_id} -> ${event.status}`,
      );
    } catch (error) {
      this.logger.error('Failed to publish status event', error);
      // Don't throw - status publishing shouldn't break email sending
    }
  }
}
