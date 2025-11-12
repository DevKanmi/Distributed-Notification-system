import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS',
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('REDIS_HOST', 'localhost');
        const port = config.get<number>('REDIS_PORT', 6379);
        const password = config.get<string>('REDIS_PASSWORD');

        const client = new Redis({
          host,
          port,
          password: password || undefined,
          retryStrategy: (times) => Math.min(times * 50, 2000),
        });

        client.on('error', (err) => {
          console.error('Redis Client Error', err);
        });

        client.on('connect', () => {
          console.log('Redis connected');
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS'],
})
export class RedisModule {}
