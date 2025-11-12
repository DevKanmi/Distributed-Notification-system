import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { NotificationType } from './create-notification.dto';

export class CreateBulkNotificationDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  notification_type: NotificationType;

  @ApiProperty({ maxLength: 100 })
  @IsNotEmpty()
  @MaxLength(100)
  template_code: string;

  @ApiProperty({ type: Object })
  @IsObject()
  variables: Record<string, unknown>;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  request_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @MaxLength(10)
  language?: string;
}
