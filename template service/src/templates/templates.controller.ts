import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TemplatesService } from './templates.service';
import { RenderService } from './render.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { AddVersionDto } from './dto/add-version.dto';
import { QueryVersionsDto } from './dto/query-versions.dto';
import { RenderTemplateDto } from './dto/render-template.dto';

@ApiTags('Templates')
@Controller('api/v1/templates')
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly renderService: RenderService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new template with first version' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  @ApiResponse({ status: 409, description: 'Template code already exists' })
  async createTemplate(@Body() dto: CreateTemplateDto) {
    const data = await this.templatesService.createTemplate(dto);
    return {
      success: true,
      message: 'Template created successfully',
      data,
    };
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get template by code with active versions' })
  @ApiResponse({ status: 200, description: 'Template found' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplate(@Param('code') code: string) {
    const data = await this.templatesService.getTemplateByCode(code);
    return {
      success: true,
      message: 'Template retrieved successfully',
      data,
    };
  }

  @Get(':code/versions')
  @ApiOperation({ summary: 'List all versions of a template' })
  @ApiResponse({ status: 200, description: 'Versions retrieved' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getVersions(
    @Param('code') code: string,
    @Query() query: QueryVersionsDto,
  ) {
    const { versions, meta } = await this.templatesService.getVersions(
      code,
      query,
    );
    return {
      success: true,
      message: 'Versions retrieved successfully',
      data: versions,
      meta,
    };
  }

  @Post(':code/versions')
  @ApiOperation({ summary: 'Add a new version to a template' })
  @ApiResponse({ status: 201, description: 'Version added successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async addVersion(@Param('code') code: string, @Body() dto: AddVersionDto) {
    const data = await this.templatesService.addVersion(code, dto);
    return {
      success: true,
      message: 'Version added successfully',
      data,
    };
  }

  @Patch(':code/versions/:version/activate')
  @ApiOperation({ summary: 'Activate a specific version' })
  @ApiResponse({ status: 200, description: 'Version activated successfully' })
  @ApiResponse({ status: 404, description: 'Template or version not found' })
  async activateVersion(
    @Param('code') code: string,
    @Param('version') version: string,
  ) {
    const versionNumber = parseInt(version, 10);
    const data = await this.templatesService.activateVersion(
      code,
      versionNumber,
    );
    return {
      success: true,
      message: 'Version activated successfully',
      data,
    };
  }

  @Post('render')
  @ApiOperation({ summary: 'Render a template with variables' })
  @ApiResponse({ status: 200, description: 'Template rendered successfully' })
  @ApiResponse({
    status: 404,
    description: 'Template or active version not found',
  })
  async renderTemplate(@Body() dto: RenderTemplateDto) {
    const data = await this.renderService.renderTemplate(
      dto.template_code,
      dto.language,
      dto.variables,
    );
    return {
      success: true,
      message: 'Template rendered successfully',
      data,
    };
  }
}
