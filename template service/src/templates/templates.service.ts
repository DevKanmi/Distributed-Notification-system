import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from './entities/template.entity';
import { TemplateVersion } from './entities/template-version.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { AddVersionDto } from './dto/add-version.dto';
import { QueryVersionsDto } from './dto/query-versions.dto';
import { PaginationMeta } from '../common/dto/api-response.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(TemplateVersion)
    private readonly versionRepo: Repository<TemplateVersion>,
    private readonly eventsService: EventsService,
  ) {}

  async createTemplate(dto: CreateTemplateDto) {
    // Check if template with code already exists
    const existing = await this.templateRepo.findOne({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Template with code '${dto.code}' already exists`,
      );
    }

    // Create template
    const template = this.templateRepo.create({
      code: dto.code,
      name: dto.name,
      description: dto.description,
    });

    const savedTemplate = await this.templateRepo.save(template);

    // Create first version
    const version = this.versionRepo.create({
      template_id: savedTemplate.id,
      language: dto.language,
      version: 1,
      subject: dto.subject,
      body: dto.body,
      is_active: true,
    });

    await this.versionRepo.save(version);

    // Emit event
    await this.eventsService.publishTemplateUpdated({
      template_code: dto.code,
      language: dto.language,
      version: 1,
      event_type: 'created',
      timestamp: new Date().toISOString(),
    });

    return this.getTemplateByCode(dto.code);
  }

  async getTemplateByCode(code: string) {
    const template = await this.templateRepo.findOne({
      where: { code },
      relations: ['versions'],
    });

    if (!template) {
      throw new NotFoundException(`Template with code '${code}' not found`);
    }

    // Group active versions by language
    const active_versions = template.versions
      .filter((v) => v.is_active)
      .reduce(
        (acc, v) => {
          acc[v.language] = {
            version: v.version,
            subject: v.subject,
            created_at: v.created_at,
          };
          return acc;
        },
        {} as Record<string, unknown>,
      );

    return {
      id: template.id,
      code: template.code,
      name: template.name,
      description: template.description,
      created_at: template.created_at,
      updated_at: template.updated_at,
      active_versions,
    };
  }

  async getVersions(code: string, query: QueryVersionsDto) {
    const template = await this.templateRepo.findOne({ where: { code } });

    if (!template) {
      throw new NotFoundException(`Template with code '${code}' not found`);
    }

    const { language, page = 1, limit = 10 } = query;

    const whereClause: Record<string, unknown> = { template_id: template.id };
    if (language) {
      whereClause.language = language;
    }

    const [versions, total] = await this.versionRepo.findAndCount({
      where: whereClause,
      order: { language: 'ASC', version: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    const meta: PaginationMeta = {
      total,
      limit,
      page,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_previous: page > 1,
    };

    return { versions, meta };
  }

  async addVersion(code: string, dto: AddVersionDto) {
    const template = await this.templateRepo.findOne({ where: { code } });

    if (!template) {
      throw new NotFoundException(`Template with code '${code}' not found`);
    }

    // Get the latest version number for this language
    const latestVersion = await this.versionRepo.findOne({
      where: { template_id: template.id, language: dto.language },
      order: { version: 'DESC' },
    });

    const nextVersion = latestVersion ? latestVersion.version + 1 : 1;

    // If is_active is true, deactivate other versions for this language
    if (dto.is_active) {
      await this.versionRepo.update(
        { template_id: template.id, language: dto.language },
        { is_active: false },
      );
    }

    const version = this.versionRepo.create({
      template_id: template.id,
      language: dto.language,
      version: nextVersion,
      subject: dto.subject,
      body: dto.body,
      is_active: dto.is_active ?? false,
    });

    const savedVersion = await this.versionRepo.save(version);

    // Emit event
    await this.eventsService.publishTemplateUpdated({
      template_code: code,
      language: dto.language,
      version: nextVersion,
      event_type: 'version_added',
      timestamp: new Date().toISOString(),
    });

    return savedVersion;
  }

  async activateVersion(code: string, versionNumber: number) {
    const template = await this.templateRepo.findOne({ where: { code } });

    if (!template) {
      throw new NotFoundException(`Template with code '${code}' not found`);
    }

    const version = await this.versionRepo.findOne({
      where: { template_id: template.id, version: versionNumber },
    });

    if (!version) {
      throw new NotFoundException(
        `Version ${versionNumber} not found for template '${code}'`,
      );
    }

    // Deactivate all other versions for the same language
    await this.versionRepo.update(
      { template_id: template.id, language: version.language },
      { is_active: false },
    );

    // Activate the target version
    version.is_active = true;
    const savedVersion = await this.versionRepo.save(version);

    // Emit event
    await this.eventsService.publishTemplateUpdated({
      template_code: code,
      language: version.language,
      version: versionNumber,
      event_type: 'version_activated',
      timestamp: new Date().toISOString(),
    });

    return savedVersion;
  }
}
