// // src/user/user.service.ts
// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { User } from './user.entity';

// @Injectable()
// export class UserService {
//   constructor(
//     @InjectRepository(User)
//     private readonly userRepository: Repository<User>,
//   ) {}

//   async createUser(data: Partial<User>): Promise<User> {
//     const user = this.userRepository.create(data);
//     return await this.userRepository.save(user);
//   }

//   async getAllUsers(): Promise<User[]> {
//     return await this.userRepository.find();
//   }

//   async getUserById(id: string): Promise<User> {
//     const user = await this.userRepository.findOne({ where: { id } });
//     if (!user) throw new NotFoundException('User not found');
//     return user;
//   }

//   async findByEmail(email: string): Promise<User | null> {
//     return this.userRepository.findOne({ where: { email } });
//   }

//   // ✅ PUSH TOKEN METHODS
//   async addPushToken(userId: string, token: string): Promise<User> {
//     const user = await this.getUserById(userId);
//     const tokens = new Set(user.pushTokens || []);
//     tokens.add(token);
//     user.pushTokens = Array.from(tokens);
//     return await this.userRepository.save(user);
//   }

//   async removePushToken(userId: string, token: string): Promise<User> {
//     const user = await this.getUserById(userId);
//     user.pushTokens = (user.pushTokens || []).filter(t => t !== token);
//     return await this.userRepository.save(user);
//   }

//   async getPushTokens(userId: string): Promise<string[]> {
//     const user = await this.getUserById(userId);
//     return user.pushTokens || [];
//   }

//   // ✅ NOTIFICATION PREFERENCES
//   async getPreferences(userId: string): Promise<Record<string, any>> {
//     const user = await this.getUserById(userId);
//     return user.preferences || {};
//   }

//   async updatePreferences(
//     userId: string,
//     prefs: Record<string, any>,
//   ): Promise<User> {
//     const user = await this.getUserById(userId);
//     user.preferences = { ...user.preferences, ...prefs };
//     return await this.userRepository.save(user);
//   }
// }

// src/user/user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { RedisService } from '../redis/redis.service'; // ✅ import RedisService

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly redisService: RedisService, // ✅ inject redis
  ) {}

  // ✅ Create a new user
  async createUser(data: Partial<User>): Promise<User> {
    const user = this.userRepository.create(data);
    const savedUser = await this.userRepository.save(user);

    // Cache user data
    await this.redisService.set(`user:${savedUser.id}`, JSON.stringify(savedUser));
    return savedUser;
  }

  // ✅ Get all users
  async getAllUsers(): Promise<User[]> {
    return await this.userRepository.find();
  }

  // ✅ Get user by ID (use cache first)
  async getUserById(id: string): Promise<User> {
    const cachedUser = await this.redisService.get(`user:${id}`);
    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    await this.redisService.set(`user:${id}`, JSON.stringify(user));
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  // ✅ Update User (PATCH /users/:id)
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = await this.getUserById(id);

    Object.assign(user, data); // merge changes safely
    const updatedUser = await this.userRepository.save(user);

    // Update cache
    await this.redisService.set(`user:${id}`, JSON.stringify(updatedUser));
    return updatedUser;
  }

  // ✅ PUSH TOKEN METHODS
  async addPushToken(userId: string, token: string): Promise<User> {
    const user = await this.getUserById(userId);
    const tokens = new Set(user.pushTokens || []);
    tokens.add(token);
    user.pushTokens = Array.from(tokens);
    const updatedUser = await this.userRepository.save(user);

    await this.redisService.set(`user:${userId}`, JSON.stringify(updatedUser));
    return updatedUser;
  }

  // ✅ Allow removing push token by either body or param
  async removePushToken(userId: string, token: string): Promise<User> {
    const user = await this.getUserById(userId);
    user.pushTokens = (user.pushTokens || []).filter((t) => t !== token);
    const updatedUser = await this.userRepository.save(user);

    await this.redisService.set(`user:${userId}`, JSON.stringify(updatedUser));
    return updatedUser;
  }

  async getPushTokens(userId: string): Promise<string[]> {
    const user = await this.getUserById(userId);
    return user.pushTokens || [];
  }

  // ✅ NOTIFICATION PREFERENCES
  async getPreferences(userId: string): Promise<Record<string, any>> {
    const user = await this.getUserById(userId);
    return user.preferences || {};
  }

  async updatePreferences(userId: string, prefs: Record<string, any>): Promise<User> {
    const user = await this.getUserById(userId);
    user.preferences = { ...user.preferences, ...prefs };
    const updatedUser = await this.userRepository.save(user);

    await this.redisService.set(`user:${userId}`, JSON.stringify(updatedUser));
    return updatedUser;
  }
}
