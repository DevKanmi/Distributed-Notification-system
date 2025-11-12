import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EmailService } from './email.service';
import { UserServiceClient } from './user-service.client';
import { TemplateServiceClient } from './template-service.client';
import { StatusService } from './status.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [HttpModule, RedisModule],
  providers: [
    EmailService,
    UserServiceClient,
    TemplateServiceClient,
    StatusService,
  ],
  exports: [
    EmailService,
    UserServiceClient,
    TemplateServiceClient,
    StatusService,
  ],
})
export class ServicesModule {}
