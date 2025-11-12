import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StatusService } from './status.service';
import { StatusListenerService } from './status-listener.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [ConfigModule, RedisModule],
  providers: [StatusService, StatusListenerService],
  exports: [StatusService],
})
export class StatusModule {}
