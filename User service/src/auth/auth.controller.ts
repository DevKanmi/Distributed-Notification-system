import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

// POST /auth/register
  @Post('register')
  async register(
    @Body('email') email: string,
    @Body('password') password: string,
    @Body('name') name: string,
  ) {
    return this.authService.register(email, password, name);
  }
// POST /auth/login
  @Post('login')
  async login(
    @Body('email') email: string,
    @Body('password') password: string,
  ) {
    return this.authService.login(email, password);
  }
  // POST /auth/logout
   @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req) {
    const userId = req.user.sub; // get user ID from JWT payload
    return await this.authService.logout(userId);
  }

}
