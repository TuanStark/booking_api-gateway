import { Injectable } from '@nestjs/common';

// wrapper dễ test & DI.
@Injectable()
export class AppConfigService {
  get authServiceUrl(): string {
    return process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
  }
  get userServiceUrl(): string {
    return process.env.USER_SERVICE_URL || 'http://localhost:3003';
  }
  get buildingServiceurl(): string {
    return process.env.BUILDING_SERVICE_URL || 'http://localhost:3002';
  }
  get roomServiceUrl(): string {
    return process.env.ROOM_SERVICE_URL || 'http://localhost:3003';
  }
  get publicKeyPath(): string {
    return process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem';
  }
  get bookingServiceUrl(): string {
    return process.env.BOOKING_SERVICE_URL || 'http://localhost:3005';
  }
  get reviewServiceUrl(): string {
    return process.env.REVIEW_SERVICE_URL || 'http://localhost:3008';
  }

  get port(): number {
    return Number(process.env.PORT || 4000);
  }
  get rateLimitTTL(): number {
    return Number(process.env.RATE_LIMIT_TTL || 60);
  }
  get rateLimitLimit(): number {
    return Number(process.env.RATE_LIMIT_REQ || 100);
  }
}
