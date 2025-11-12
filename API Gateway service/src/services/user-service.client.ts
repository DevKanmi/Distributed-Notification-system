import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type CircuitBreaker from 'opossum';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CircuitBreakerConstructor = require('opossum');

export interface UsersByPreferenceResponse {
  user_ids: string[];
}

@Injectable()
export class UserServiceClient {
  private readonly logger = new Logger(UserServiceClient.name);
  private readonly baseUrl: string;
  private circuitBreaker: CircuitBreaker<
    ['email' | 'push'],
    UsersByPreferenceResponse
  >;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>(
      'USER_SERVICE_URL',
      'http://localhost:3002',
    );

    const options = {
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    this.circuitBreaker = new CircuitBreakerConstructor(
      this.fetchUsersByPreference.bind(this),
      options,
    ) as CircuitBreaker<['email' | 'push'], UsersByPreferenceResponse>;

    this.circuitBreaker.on('open', () => {
      this.logger.warn('Circuit breaker opened for User Service');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.log('Circuit breaker half-open for User Service');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.log('Circuit breaker closed for User Service');
    });
  }

  private async fetchUsersByPreference(
    preference: 'email' | 'push',
  ): Promise<UsersByPreferenceResponse> {
    const response = await firstValueFrom(
      this.http.get<{
        success: boolean;
        data:
          | { user_ids: string[] }
          | { users: Array<{ id: string }> }
          | Array<{ id: string }>;
      }>(`${this.baseUrl}/api/v1/users`, {
        params: { preference },
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!response.data?.success || !response.data?.data) {
      throw new Error('Invalid user service response');
    }

    // Handle different response formats
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const data = response.data.data;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (Array.isArray((data as { user_ids?: string[] }).user_ids)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return { user_ids: (data as { user_ids: string[] }).user_ids };
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (Array.isArray((data as { users?: Array<{ id: string }> }).users)) {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        user_ids: (data as { users: Array<{ id: string }> }).users.map(
          (user: { id: string }) => user.id,
        ),
      };
    }
    if (Array.isArray(data)) {
      return {
        user_ids: (data as Array<{ id: string }>).map(
          (user: { id: string }) => user.id,
        ),
      };
    }

    throw new Error('Unexpected user service response format');
  }

  async getUsersByPreference(
    preference: 'email' | 'push',
  ): Promise<UsersByPreferenceResponse> {
    try {
      return await this.circuitBreaker.fire(preference);
    } catch (error) {
      this.logger.error(
        `Failed to fetch users with preference ${preference}`,
        error,
      );
      throw error;
    }
  }

  isCircuitOpen(): boolean {
    return this.circuitBreaker.opened;
  }
}
