// src/redis/redis.module.ts
import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global() // makes RedisService available globally
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
