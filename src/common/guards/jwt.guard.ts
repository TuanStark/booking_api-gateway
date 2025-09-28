import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { loadPublicKey } from '../../utils/publicKey.util';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private publicKey: string;

  constructor(private readonly config: ConfigService) {
    // Đọc public key (được mount từ auth-service)
    this.publicKey = loadPublicKey();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader) throw new UnauthorizedException('Missing Authorization header');

    const token = authHeader.split(' ')[1];
    if (!token) throw new UnauthorizedException('Invalid Authorization format');

    try {
      const payload = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
      });

      // attach user vào request để service sau có thể dùng
      (request as any).user = payload;
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
