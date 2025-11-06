import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { loadPublicKey } from '../../utils/publicKey.util';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private publicKey: string;

  constructor(
    private readonly config: ConfigService,
    private reflector: Reflector,
  ) {
    // Đọc public key (được mount từ auth-service)
    this.publicKey = loadPublicKey();
    console.log('JWT Guard initialized with public key length:', this.publicKey.length);
    console.log('First 50 chars of public key:', this.publicKey.substring(0, 50));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      return true; // Allow access to public routes
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader) throw new UnauthorizedException('Missing Authorization header');

    const token = authHeader.split(' ')[1];
    console.log('token', token);
    if (!token) throw new UnauthorizedException('Invalid Authorization format');

    // Log để debug
    console.log('publicKey exists:', !!this.publicKey);
    console.log('publicKey length:', this.publicKey?.length);

    try {
      const payload = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
      });
      console.log('payload', payload);

      // attach user vào request để service sau có thể dùng
      (request as any).user = payload;
      return true;
    } catch (err) {
      console.error('JWT verification error:', err.message);
      console.error('Error details:', err);
      throw new UnauthorizedException(`Invalid or expired token: ${err.message}`);
    }
  }
}
