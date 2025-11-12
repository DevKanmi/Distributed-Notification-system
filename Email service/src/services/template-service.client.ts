import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { firstValueFrom } from 'rxjs';
import Redis from 'ioredis';

export interface RenderedTemplate {
  template_code: string;
  language: string;
  version: number;
  rendered_subject: string;
  rendered_body: string;
}

@Injectable()
export class TemplateServiceClient {
  private readonly logger = new Logger(TemplateServiceClient.name);
  private readonly baseUrl: string;
  private circuitBreaker: CircuitBreaker<
    [string, string, Record<string, unknown>],
    RenderedTemplate
  >;
  private readonly cacheTtl = 3600; // 1 hour

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @Inject('REDIS') private readonly redis: Redis,
  ) {
    this.baseUrl = this.config.get<string>(
      'TEMPLATE_SERVICE_URL',
      'http://localhost:3000',
    );

    const options = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    };

    this.circuitBreaker = new CircuitBreaker(
      this.fetchTemplate.bind(this),
      options,
    );

    this.circuitBreaker.on('open', () => {
      this.logger.warn('Circuit breaker opened for Template Service');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.log('Circuit breaker half-open for Template Service');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.log('Circuit breaker closed for Template Service');
    });
  }

  private async fetchTemplate(
    templateCode: string,
    language: string,
    variables: Record<string, unknown>,
  ): Promise<RenderedTemplate> {
    const response = await firstValueFrom(
      this.http.post(`${this.baseUrl}/api/v1/templates/render`, {
        template_code: templateCode,
        language,
        variables,
      }),
    );

    if (!response.data?.success || !response.data?.data) {
      throw new Error('Invalid template service response');
    }

    return response.data.data;
  }

  async getRenderedTemplate(
    templateCode: string,
    language: string,
    variables: Record<string, unknown>,
  ): Promise<RenderedTemplate> {
    // Create cache key with variables hash to handle different variable sets
    const variablesHash = this.hashVariables(variables);
    const cacheKey = `template:${templateCode}:${language}:${variablesHash}`;

    // Check cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for ${cacheKey}`);
        return JSON.parse(cached) as RenderedTemplate;
      }
    } catch (error) {
      this.logger.warn('Cache read error', error);
    }

    // Cache miss - fetch from service
    try {
      const template = (await this.circuitBreaker.fire(
        templateCode,
        language,
        variables,
      ));

      // Cache the rendered template
      try {
        await this.redis.setex(cacheKey, this.cacheTtl, JSON.stringify(template));
        this.logger.debug(`Cached template ${cacheKey}`);
      } catch (error) {
        this.logger.warn('Cache write error', error);
      }

      return template;
    } catch (error) {
      this.logger.error(
        `Failed to fetch template ${templateCode}:${language}`,
        error,
      );
      throw error;
    }
  }

  async invalidateCache(templateCode: string, language: string): Promise<void> {
    // Invalidate all cached versions for this template+language (pattern match)
    try {
      const pattern = `template:${templateCode}:${language}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger.debug(`Invalidated ${keys.length} cache entries for ${templateCode}:${language}`);
      }
    } catch (error) {
      this.logger.warn('Cache invalidation error', error);
    }
  }

  private hashVariables(variables: Record<string, unknown>): string {
    // Simple hash of variables for cache key
    const sorted = Object.keys(variables)
      .sort()
      .map((key) => `${key}:${String(variables[key])}`)
      .join('|');
    // Simple hash (in production, use crypto.createHash)
    return Buffer.from(sorted).toString('base64').substring(0, 16);
  }

  isCircuitOpen(): boolean {
    return this.circuitBreaker.opened;
  }
}
