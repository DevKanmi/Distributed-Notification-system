import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { ChannelWrapper } from 'amqp-connection-manager';
import { Channel } from 'amqplib';

export interface TemplateUpdatedEvent {
  template_code: string;
  language: string;
  version: number;
  event_type: 'created' | 'version_added' | 'version_activated';
  timestamp: string;
}

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: ChannelWrapper;
  private readonly exchange = 'notifications.direct';
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.initializeRabbitMQ();
  }

  private initializeRabbitMQ() {
    const rabbitmqUrl = this.configService.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );

    this.connection = amqp.connect([rabbitmqUrl]);

    this.connection.on('connect', () => {
      this.logger.log('Connected to RabbitMQ');
      this.isConnected = true;
    });

    this.connection.on('disconnect', (params) => {
      const err = params?.err;
      this.logger.warn('Disconnected from RabbitMQ', err?.message || '');
      this.isConnected = false;
    });

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        await channel.assertExchange(this.exchange, 'direct', {
          durable: true,
        });
        this.logger.log(`Exchange '${this.exchange}' asserted`);
      },
    });
  }

  async publishTemplateUpdated(event: TemplateUpdatedEvent): Promise<void> {
    try {
      await this.channelWrapper.publish(
        this.exchange,
        'template.updated',
        event,
        { persistent: true },
      );
      this.logger.debug(
        `Published template.updated event: ${event.template_code} (${event.event_type})`,
      );
    } catch (error) {
      this.logger.error('Failed to publish template.updated event', error);
      // Don't throw - we don't want event publishing to break the main flow
    }
  }

  checkConnection(): boolean {
    return this.isConnected;
  }

  async onModuleDestroy() {
    await this.channelWrapper.close();
    await this.connection.close();
    this.logger.log('RabbitMQ connection closed');
  }
}
