import { Controller, Get } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  async getHealth() {
    // ✅ Check database connection
    const dbStatus = this.dataSource.isInitialized ? 'up' : 'down';

    // ✅ Check Redis
    let redisStatus = 'down';
    try {
      await this.redisService.get('health-check'); // simple test
      redisStatus = 'up';
    } catch (err) {
      redisStatus = 'down';
    }

    return {
      status: 'ok✅',
      service: 'user-service',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }
}
