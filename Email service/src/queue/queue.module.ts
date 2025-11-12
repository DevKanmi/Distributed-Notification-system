import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueService } from './queue.service';
import { ServicesModule } from '../services/services.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule, ServicesModule],
  providers: [QueueService],
})
export class QueueModule {}
