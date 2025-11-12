import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from './health.controller';

@Module({
  imports: [QueueModule, RedisModule],
  controllers: [HealthController],
})
export class HealthModule {}
