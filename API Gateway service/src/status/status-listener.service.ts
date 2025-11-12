import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { Channel } from 'amqplib';
import { StatusService, NotificationStatusEvent } from './status.service';

@Injectable()
export class StatusListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatusListenerService.name);
  private connection: amqp.AmqpConnectionManager;
  private channelWrapper: amqp.ChannelWrapper;

  constructor(
    private readonly config: ConfigService,
    private readonly statusService: StatusService,
  ) {}

  onModuleInit() {
    const rabbitUrl = this.config.get<string>(
      'RABBITMQ_URL',
      'amqp://guest:guest@localhost:5672',
    );
    const exchange = this.config.get<string>(
      'RABBITMQ_EXCHANGE',
      'notifications.direct',
    );
    const statusQueue = this.config.get<string>(
      'STATUS_QUEUE',
      'gateway.status.queue',
    );
    const routingKey = this.config.get<string>(
      'STATUS_ROUTING_KEY',
      'notifications.status',
    );

    this.connection = amqp.connect([rabbitUrl]);
    this.connection.on('connect', () =>
      this.logger.log('Status listener connected to RabbitMQ'),
    );
    this.connection.on('disconnect', (params) => {
      const error = params?.err;
      this.logger.warn(
        'Status listener disconnected from RabbitMQ',
        error?.message ?? '',
      );
    });

    this.channelWrapper = this.connection.createChannel({
      json: true,
      setup: async (channel: Channel) => {
        await channel.assertExchange(exchange, 'direct', { durable: true });

        await channel.assertQueue(statusQueue, { durable: true });

        await channel.bindQueue(statusQueue, exchange, routingKey);

        await channel.consume(
          statusQueue,
          (message) => {
            if (!message) return;
            void (async () => {
              try {
                const payload = JSON.parse(
                  message.content.toString(),
                ) as NotificationStatusEvent;
                await this.statusService.storeStatus(payload);
                channel.ack(message);
              } catch (error) {
                this.logger.error(
                  'Failed to process status message',
                  error as Error,
                );
                channel.nack(message, false, false);
              }
            })();
          },
          { noAck: false },
        );

        this.logger.log(`Consuming status events from ${statusQueue}`);
      },
    });
  }

  async onModuleDestroy() {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
