// src/user/user.controller.ts
import { Controller, Get, Post, Body, Param, Delete, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { UserService } from './user.service';
import { User } from './user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard) // Protect all routes
export class UserController {
  constructor(private readonly userService: UserService) {}

  // POST /users → Create a new user
  @Post()
  async createUser(@Body() data: Partial<User>) {
    return await this.userService.createUser(data);
  }

  // GET /users → Get all users
  @Get()
  async getAllUsers() {
    return await this.userService.getAllUsers();
  }

  // GET /users/:id → Get user by ID
  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return await this.userService.getUserById(id);
  }

  // ✅ PUSH TOKEN ROUTES
  // POST /users/:id/push-tokens → Add a push token
  @Post(':id/push-tokens')
  async addPushToken(@Param('id') id: string, @Body('token') token: string) {
    return await this.userService.addPushToken(id, token);
  }

 // DELETE /users/:id/push-tokens/:token → Remove a push token
@Delete(':id/push-tokens/:token')
async removePushToken(@Param('id') id: string, @Param('token') token: string) {
  return await this.userService.removePushToken(id, token);
}

  // GET /users/:id/push-tokens → Get user’s push tokens
  @Get(':id/push-tokens')
  async getPushTokens(@Param('id') id: string) {
    return await this.userService.getPushTokens(id);
  }

  // ✅ NOTIFICATION PREFERENCES ROUTES
  // GET /users/:id/preferences → Get preferences
  @Get(':id/preferences')
  async getPreferences(@Param('id') id: string) {
    return await this.userService.getPreferences(id);
  }

  // PATCH /users/:id/preferences → Update preferences
  @Patch(':id/preferences')
  async updatePreferences(@Param('id') id: string, @Body() prefs: Record<string, any>) {
    return await this.userService.updatePreferences(id, prefs);
  }
  //PATCH /users/:id → Update user details
  @Patch(':id')
async updateUser(@Param('id') id: string, @Body() data: Partial<User>) {
  return await this.userService.updateUser(id, data);
}

}
