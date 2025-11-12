import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import CircuitBreaker from 'opossum';
import { firstValueFrom } from 'rxjs';

export interface UserData {
  id: string;
  email: string;
  language?: string;
  preferences?: {
    email?: boolean;
  };
}

@Injectable()
export class UserServiceClient {
  private readonly logger = new Logger(UserServiceClient.name);
  private readonly baseUrl: string;
  private circuitBreaker: CircuitBreaker<[string], UserData>;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>(
      'USER_SERVICE_URL',
      'http://localhost:3002',
    );

    const options = {
      timeout: 5000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    };

    this.circuitBreaker = new CircuitBreaker(
      this.fetchUser.bind(this),
      options,
    );

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

  private async fetchUser(userId: string): Promise<UserData> {
    const response = await firstValueFrom(
      this.http.get(`${this.baseUrl}/api/v1/users/${userId}`),
    );

    if (!response.data?.success || !response.data?.data) {
      throw new Error('Invalid user service response');
    }

    return response.data.data;
  }

  async getUser(userId: string): Promise<UserData> {
    try {
      return await this.circuitBreaker.fire(userId);
    } catch (error) {
      this.logger.error(`Failed to fetch user ${userId}`, error);
      throw error;
    }
  }

  isCircuitOpen(): boolean {
    return this.circuitBreaker.opened;
  }
}
