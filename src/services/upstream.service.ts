// src/services/upstream.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Readable } from 'stream';
import type { Request } from 'express';
import FormData from 'form-data';

@Injectable()
export class UpstreamService {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(UpstreamService.name);

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
      case 'buildings':
        return this.configService.get<string>('BUILDING_SERVICE_URL') || 'http://localhost:3002';
      default:
        throw new Error(`Unknown service: ${service}`);
    }
  }

  async forwardRequest(
    service: string,
    path: string,
    method: string,
    req: Request | any,
    headers: Record<string, any> = {},
  ): Promise<{ status: number; data: any; headers: Record<string, any> }> {
    const url = `${this.getBaseUrl(service)}${path}`;
    let data: any = undefined;

    const contentType = req.headers?.['content-type'];
    const forwardedHeaders: Record<string, any> = {
      authorization: req.headers['authorization'],
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      accept: req.headers['accept'],
      'user-agent': req.headers['user-agent'],
      'x-correlation-id': req.headers['x-correlation-id'],
      ...headers,
    };

    // ✅ Nếu multipart/form-data → chuyển tiếp stream gốc, giữ nguyên boundary
    if (contentType && contentType.includes('multipart/form-data')) {
      data = req;
      headers = forwardedHeaders;
    } else {
      // ✅ Nếu JSON
      data = req.body;
      headers = {
        ...forwardedHeaders,
        'content-type': contentType || 'application/json',
      };
    }

    this.logger.log(`[${method}] → ${url}`);

    const response = await firstValueFrom(
      this.httpService.request({
        url,
        method: method as any,
        data,
        headers,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        // Do not throw on non-2xx; we forward status and data
        validateStatus: () => true,
      }),
    );

    return {
      status: response.status,
      data: response.data,
      headers: response.headers as unknown as Record<string, any>,
    };
  }
}
