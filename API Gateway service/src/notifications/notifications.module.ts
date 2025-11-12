import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { QueueModule } from '../queue/queue.module';
import { StatusModule } from '../status/status.module';
import { RedisModule } from '../redis/redis.module';
import { ServicesModule } from '../services/services.module';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    ConfigModule,
    QueueModule,
    StatusModule,
    RedisModule,
    ServicesModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
