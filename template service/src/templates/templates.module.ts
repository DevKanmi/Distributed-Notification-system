import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { RenderService } from './render.service';
import { Template } from './entities/template.entity';
import { TemplateVersion } from './entities/template-version.entity';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, TemplateVersion]),
    EventsModule,
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService, RenderService],
  exports: [TemplatesService, RenderService],
})
export class TemplatesModule {}
