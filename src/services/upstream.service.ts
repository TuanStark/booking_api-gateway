// src/services/upstream.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UpstreamService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // Tùy theo serviceName mà chọn baseUrl
  private getBaseUrl(service: string): string {
    switch (service) {
      case 'auth':
        return this.configService.get<string>('AUTH_SERVICE_URL') || 'http://localhost:4000';
      case 'booking':
        return this.configService.get<string>('BOOKING_SERVICE_URL') || 'http://localhost:4001';
      case 'payment':
        return this.configService.get<string>('PAYMENT_SERVICE_URL') || 'http://localhost:4002';
      case 'notification':
        return this.configService.get<string>('NOTIFICATION_SERVICE_URL') || 'http://localhost:4003';
      default:
        throw new Error(`Unknown service: ${service}`);
    }
  }

  async forwardRequest(service: string, path: string, method: string, body?: any, headers?: any) {
    const url = `${this.getBaseUrl(service)}${path}`;

    const response = await firstValueFrom(
      this.httpService.request({
        url,
        method: method as any,
        data: body,
        headers,
      }),
    );

    return response.data;
  }
}
