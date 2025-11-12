import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export interface NotificationStatus {
  notification_id: string;
  status: 'pending' | 'delivered' | 'failed';
  service: 'email' | 'push';
  error?: string;
  created_at: string;
  updated_at: string;
}

export interface NotificationStatusEvent {
  notification_id: string;
  status: 'pending' | 'delivered' | 'failed';
  timestamp: string;
  error?: string;
  service: 'email' | 'push';
}

@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);
  private readonly ttlSeconds = 60 * 60 * 24 * 7; // 7 days

  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  private buildKey(notificationId: string): string {
    return `notification:${notificationId}`;
  }

  async storeStatus(event: NotificationStatusEvent): Promise<void> {
    const key = this.buildKey(event.notification_id);
    const now = new Date().toISOString();

    const status: NotificationStatus = {
      notification_id: event.notification_id,
      status: event.status,
      service: event.service,
      error: event.error,
      created_at: event.timestamp ?? now,
      updated_at: now,
    };

    try {
      await this.redis.set(key, JSON.stringify(status), 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.error('Failed to store notification status', error as Error);
      throw error;
    }
  }

  async setInitialStatus(notificationId: string, service: 'email' | 'push') {
    const key = this.buildKey(notificationId);
    const now = new Date().toISOString();

    const status: NotificationStatus = {
      notification_id: notificationId,
      status: 'pending',
      service,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.redis.set(key, JSON.stringify(status), 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.error('Failed to set initial status', error as Error);
      throw error;
    }
  }

  async getStatus(notificationId: string): Promise<NotificationStatus | null> {
    const key = this.buildKey(notificationId);
    try {
      const result = await this.redis.get(key);
      return result ? (JSON.parse(result) as NotificationStatus) : null;
    } catch (error) {
      this.logger.error('Failed to get notification status', error as Error);
      throw error;
    }
  }
}
