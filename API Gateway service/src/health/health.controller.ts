import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import Redis from 'ioredis';
import { QueueService } from '../queue/queue.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    private readonly queueService: QueueService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Service health check' })
  async getHealth() {
    const checks: Record<string, 'up' | 'down'> = {
      redis: 'down',
      rabbitmq: 'down',
    };

    try {
      await this.redis.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }

    checks.rabbitmq = this.queueService.isConnected() ? 'up' : 'down';

    const allUp = Object.values(checks).every((value) => value === 'up');

    return {
      success: allUp,
      message: allUp ? 'Service healthy' : 'Service degraded',
      data: {
        status: allUp ? 'healthy' : 'degraded',
        checks,
      },
    };
  }
}
