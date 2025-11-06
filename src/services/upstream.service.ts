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
        return (
          this.configService.get<string>('AUTH_SERVICE_URL') ||
          'http://localhost:3001'
        );
      case 'booking':
        return (
          this.configService.get<string>('BOOKING_SERVICE_URL') ||
          'http://localhost:3005'
        );
      case 'payment':
        return (
          this.configService.get<string>('PAYMENT_SERVICE_URL') ||
          'http://localhost:3006'
        );
      case 'notification':
        return (
          this.configService.get<string>('NOTIFICATION_SERVICE_URL') ||
          'http://localhost:3007'
        );
      case 'buildings':
        return (
          this.configService.get<string>('BUILDING_SERVICE_URL') ||
          'http://localhost:3002'
        );
      case 'rooms':
        return (
          this.configService.get<string>('ROOM_SERVICE_URL') ||
          'http://localhost:3003'
        );
      case 'bookings':
        return (
          this.configService.get<string>('BOOKING_SERVICE_URL') ||
          'http://localhost:3005'
        );
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
      ...headers,
    };

    // ✅ Nếu multipart/form-data → rebuild FormData từ req.body và req.files
    if (contentType && contentType.includes('multipart/form-data')) {
      const form = new FormData();

      // Append body fields
      for (const field in req.body) {
        form.append(field, req.body[field]);
      }

      // Append files
      if (req.files) {
        const files = Array.isArray(req.files) ? req.files : [req.files];
        for (const file of files) {
          form.append(file.fieldname, Readable.from(file.buffer), {
            filename: file.originalname,
            contentType: file.mimetype,
          });
        }
      }

      data = form;
      headers = { ...forwardedHeaders, ...form.getHeaders() };
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
        timeout: 30000, // 30 second timeout
        // Do not throw on non-2xx; we forward status and data
        validateStatus: () => true,
      }),
    );

    this.logger.log(`Response: ${response.status}`);

    return {
      status: response.status,
      data: response.data,
      headers: response.headers as unknown as Record<string, any>,
    };
  }
}
