import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Handlebars from 'handlebars';
import { Template } from './entities/template.entity';
import { TemplateVersion } from './entities/template-version.entity';

@Injectable()
export class RenderService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(TemplateVersion)
    private readonly versionRepo: Repository<TemplateVersion>,
  ) {}

  async renderTemplate(
    template_code: string,
    language: string,
    variables: Record<string, unknown>,
  ) {
    // Find template
    const template = await this.templateRepo.findOne({
      where: { code: template_code },
    });

    if (!template) {
      throw new NotFoundException(
        `Template with code '${template_code}' not found`,
      );
    }

    // Find active version for the language
    const version = await this.versionRepo.findOne({
      where: {
        template_id: template.id,
        language,
        is_active: true,
      },
    });

    if (!version) {
      throw new NotFoundException(
        `No active version found for template '${template_code}' in language '${language}'`,
      );
    }

    // Compile and render subject
    const subjectTemplate = Handlebars.compile(version.subject);
    const rendered_subject = subjectTemplate(variables);

    // Compile and render body
    const bodyTemplate = Handlebars.compile(version.body);
    const rendered_body = bodyTemplate(variables);

    return {
      template_code,
      language,
      version: version.version,
      rendered_subject,
      rendered_body,
    };
  }
}
