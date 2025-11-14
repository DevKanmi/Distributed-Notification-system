// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { User } from '../user/user.entity';
// import * as bcrypt from 'bcrypt';

// @Injectable()
// export class AuthService {
//   constructor(
//     @InjectRepository(User)
//     private readonly userRepository: Repository<User>,
//     private readonly jwtService: JwtService,
//   ) {}

//   // ✅ Register a new user
//   async register(email: string, password: string, name: string) {
//     const hashedPassword = await bcrypt.hash(password, 10);
//     const user = this.userRepository.create({
//       email,
//       password: hashedPassword,
//       name,
//     });
//     return this.userRepository.save(user);
//   }

//   // ✅ Login user and return JWT
//   async login(email: string, password: string) {
//     const user = await this.userRepository.findOne({ where: { email } });
//     if (!user) {
//       throw new UnauthorizedException('Invalid credentials');
//     }

//     const isPasswordValid = await bcrypt.compare(password, user.password);
//     if (!isPasswordValid) {
//       throw new UnauthorizedException('Invalid credentials');
//     }

//     const payload = { sub: user.id, email: user.email };
//     const token = await this.jwtService.signAsync(payload);

//     return {
//       access_token: token,
//       user: {
//         id: user.id,
//         email: user.email,
//         name: user.name,
//       },
//     };
//   }

//   // ✅ Validate user from JWT payload (used later by guards)
//   async validateUser(userId: string): Promise<User | null> {
//     return this.userRepository.findOne({ where: { id: userId } });
//   }
// }

// src/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService, // ✅ inject Redis
  ) {}

  // ✅ Register new user
  async register(email: string, password: string, name: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      name,
    });
    return this.userRepository.save(user);
  }

  // ✅ Login and store session token in Redis
  async login(email: string, password: string) {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email };
    const token = await this.jwtService.signAsync(payload);

    // ✅ Store JWT in Redis with expiry (1 day)
    await this.redisService.set(`session:${user.id}`, token);
    // Optionally set expiry
    await this.redisService.getClient().expire(`session:${user.id}`, 60 * 60 * 24);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  // ✅ Validate user by checking Redis
  async validateUser(userId: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // optional: verify if session exists in Redis
    const sessionToken = await this.redisService.get(`session:${userId}`);
    if (!sessionToken) {
      // token expired or session removed
      return null;
    }

    return user;
  }

  // ✅ Logout - remove token from Redis
  async logout(userId: string) {
    await this.redisService.del(`session:${userId}`);
    return { message: 'Logged out successfully' };
  }
}
