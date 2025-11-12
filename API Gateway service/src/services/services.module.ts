import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { UserServiceClient } from './user-service.client';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [UserServiceClient],
  exports: [UserServiceClient],
})
export class ServicesModule {}
