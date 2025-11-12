import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationStatusResponseDto {
  @ApiProperty()
  notification_id: string;

  @ApiProperty({ enum: ['pending', 'delivered', 'failed'] })
  status: 'pending' | 'delivered' | 'failed';

  @ApiProperty({ enum: ['email', 'push'] })
  service: 'email' | 'push';

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;

  @ApiPropertyOptional()
  error?: string;
}
