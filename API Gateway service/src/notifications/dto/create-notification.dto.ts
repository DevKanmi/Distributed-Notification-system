import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export enum NotificationType {
  EMAIL = 'email',
  PUSH = 'push',
}

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  notification_type: NotificationType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  user_id: string;

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

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @ValidateIf((_, value) => value === null || typeof value === 'object')
  metadata?: Record<string, unknown> | null;
}
