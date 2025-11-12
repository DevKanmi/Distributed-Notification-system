import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { CreateBulkNotificationDto } from './dto/create-bulk-notification.dto';
import { ApiResponse } from './dto/api-response.dto';
import { NotificationStatusResponseDto } from './dto/notification-status-response.dto';

@ApiTags('Notifications')
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Enqueue a notification for processing' })
  @SwaggerResponse({ status: 202, description: 'Notification accepted' })
  async createNotification(
    @Body() dto: CreateNotificationDto,
  ): Promise<ApiResponse<{ notification_id: string; request_id?: string }>> {
    const result = await this.notificationsService.createNotification(dto);

    return {
      success: true,
      message: 'Notification accepted',
      data: {
        notification_id: result.notification_id,
        request_id: result.request_id,
      },
    };
  }

  @Get(':notification_id/status')
  @ApiOperation({ summary: 'Get notification status' })
  @SwaggerResponse({ status: 200, type: NotificationStatusResponseDto })
  async getStatus(
    @Param('notification_id') notificationId: string,
  ): Promise<ApiResponse<NotificationStatusResponseDto>> {
    const status =
      await this.notificationsService.getNotificationStatus(notificationId);

    if (!status) {
      throw new NotFoundException(
        `Notification ${notificationId} status not found`,
      );
    }

    return {
      success: true,
      message: 'Notification status fetched',
      data: status,
    };
  }

  @Post('bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Enqueue bulk notifications for all users with matching preference',
  })
  @SwaggerResponse({ status: 202, description: 'Bulk notifications accepted' })
  async createBulkNotification(
    @Body() dto: CreateBulkNotificationDto,
  ): Promise<ApiResponse<{ scheduled: number; notification_ids: string[] }>> {
    const result = await this.notificationsService.createBulkNotification(dto);

    return {
      success: true,
      message: `Bulk notification scheduled for ${result.scheduled} users`,
      data: {
        scheduled: result.scheduled,
        notification_ids: result.notification_ids,
      },
    };
  }
}
