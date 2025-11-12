import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { QueueService, NotificationQueuePayload } from '../queue/queue.service';
import { StatusService } from '../status/status.service';
import { UserServiceClient } from '../services/user-service.client';
import {
  CreateNotificationDto,
  NotificationType,
} from './dto/create-notification.dto';
import { CreateBulkNotificationDto } from './dto/create-bulk-notification.dto';

interface CreateNotificationResult {
  notification_id: string;
  request_id?: string;
  status: 'pending';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly idempotencyTtlSeconds: number;

  constructor(
    private readonly queueService: QueueService,
    private readonly statusService: StatusService,
    private readonly userServiceClient: UserServiceClient,
    private readonly config: ConfigService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {
    this.idempotencyTtlSeconds = this.config.get<number>(
      'IDEMPOTENCY_TTL_SECONDS',
      60 * 60 * 24,
    );
  }

  private buildIdempotencyKey(requestId: string): string {
    return `idempotent:${requestId}`;
  }

  private determineService(
    notificationType: NotificationType,
  ): 'email' | 'push' {
    return notificationType === NotificationType.EMAIL ? 'email' : 'push';
  }

  async createNotification(
    dto: CreateNotificationDto,
  ): Promise<CreateNotificationResult> {
    if (dto.request_id) {
      const existing = await this.redis.get(
        this.buildIdempotencyKey(dto.request_id),
      );
      if (existing) {
        return {
          notification_id: existing,
          request_id: dto.request_id,
          status: 'pending',
        };
      }
    }

    const notificationId = uuidv4();
    const service = this.determineService(dto.notification_type);

    const payload: NotificationQueuePayload = {
      notification_id: notificationId,
      user_id: dto.user_id,
      template_code: dto.template_code,
      variables: dto.variables,
      priority: dto.priority,
      language: dto.language,
    };

    await this.queueService.publishNotification(payload, service);

    await this.statusService.setInitialStatus(notificationId, service);

    if (dto.request_id) {
      await this.redis.set(
        this.buildIdempotencyKey(dto.request_id),
        notificationId,
        'EX',
        this.idempotencyTtlSeconds,
      );
    }

    this.logger.log(`Created notification ${notificationId} (${service})`);

    return {
      notification_id: notificationId,
      request_id: dto.request_id,
      status: 'pending',
    };
  }

  async getNotificationStatus(notificationId: string) {
    return this.statusService.getStatus(notificationId);
  }

  async createBulkNotification(dto: CreateBulkNotificationDto): Promise<{
    scheduled: number;
    notification_ids: string[];
  }> {
    // Check idempotency for bulk operation
    if (dto.request_id) {
      const bulkKey = `bulk:${dto.request_id}`;
      const existing = await this.redis.get(bulkKey);
      if (existing) {
        const notificationIds = JSON.parse(existing) as string[];
        this.logger.log(
          `Bulk operation ${dto.request_id} already processed, returning existing notification IDs`,
        );
        return {
          scheduled: notificationIds.length,
          notification_ids: notificationIds,
        };
      }
    }

    // Get users with matching preference
    const preference =
      dto.notification_type === NotificationType.EMAIL ? 'email' : 'push';
    const usersResponse =
      await this.userServiceClient.getUsersByPreference(preference);
    const userIds = usersResponse.user_ids;

    if (userIds.length === 0) {
      this.logger.warn(`No users found with preference ${preference}`);
      return {
        scheduled: 0,
        notification_ids: [],
      };
    }

    const service = this.determineService(dto.notification_type);
    const notificationIds: string[] = [];
    const errors: Array<{ user_id: string; error: string }> = [];

    // Create notification for each user
    for (const userId of userIds) {
      try {
        const notificationId = uuidv4();

        const payload: NotificationQueuePayload = {
          notification_id: notificationId,
          user_id: userId,
          template_code: dto.template_code,
          variables: dto.variables,
          priority: dto.priority,
          language: dto.language,
        };

        await this.queueService.publishNotification(payload, service);
        await this.statusService.setInitialStatus(notificationId, service);

        notificationIds.push(notificationId);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        errors.push({ user_id: userId, error: errorMessage });
        this.logger.error(
          `Failed to create notification for user ${userId}: ${errorMessage}`,
        );
      }
    }

    // Store bulk operation idempotency
    if (dto.request_id && notificationIds.length > 0) {
      const bulkKey = `bulk:${dto.request_id}`;
      await this.redis.set(
        bulkKey,
        JSON.stringify(notificationIds),
        'EX',
        this.idempotencyTtlSeconds,
      );
    }

    if (errors.length > 0) {
      this.logger.warn(
        `Bulk notification completed with ${errors.length} errors out of ${userIds.length} users`,
      );
    }

    this.logger.log(
      `Bulk notification scheduled: ${notificationIds.length}/${userIds.length} users (${service})`,
    );

    return {
      scheduled: notificationIds.length,
      notification_ids: notificationIds,
    };
  }
}
