import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventsService } from '../events/events.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly eventsService: EventsService,
  ) {}

  @Get()
  async getHealth() {
    const checks: Record<string, string> = {};

    // Check DB connectivity
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = 'up';
    } catch {
      checks.database = 'down';
    }

    // Check RabbitMQ connectivity
    try {
      const isConnected = this.eventsService.checkConnection();
      checks.rabbitmq = isConnected ? 'up' : 'down';
    } catch {
      checks.rabbitmq = 'down';
    }

    const isHealthy = Object.values(checks).every((v) => v === 'up');

    return {
      success: isHealthy,
      message: isHealthy ? 'All systems operational' : 'Some systems down',
      data: {
        status: isHealthy ? 'healthy' : 'degraded',
        checks,
      },
    };
  }
}
