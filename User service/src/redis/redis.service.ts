// src/redis/redis.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit() {
    // connect to local Redis
    this.client = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
    
    this.client.on('connect', () => console.log('✅ Redis connected'));
    this.client.on('error', (err) => console.error('❌ Redis error:', err));
  }

  onModuleDestroy() {
    this.client.quit();
  }

  // helper methods you can use anywhere in your app
  async set(key: string, value: string) {
    await this.client.set(key, value);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async del(key: string) {
    await this.client.del(key);
  }

  getClient() {
    return this.client;
  }
}
