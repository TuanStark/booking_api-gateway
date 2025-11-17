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
    extraHeaders: Record<string, any> = {},
  ): Promise<{ status: number; data: any; headers: Record<string, any> }> {
    const url = `${this.getBaseUrl(service)}${path}`;
    let data: any = undefined;
    let finalHeaders: Record<string, any> = {};
  
    // BƯỚC 1: Copy TẤT CẢ headers từ req (trừ host, connection,...)
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value && typeof value === 'string') {
        // Loại bỏ các header không nên forward
        if (!['host', 'connection', ':path', ':method'].includes(key.toLowerCase())) {
          finalHeaders[key] = value;
        }
      }
    });
  
    // BƯỚC 2: Ghi đè bằng extraHeaders (authorization, x-user-id,...)
    Object.entries(extraHeaders).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        finalHeaders[key] = value;
      }
    });
  
    const contentType = finalHeaders['content-type'];
  
    // Xử lý multipart/form-data
    if (contentType && contentType.includes('multipart/form-data')) {
      const form = new FormData();
      for (const field in req.body) {
        form.append(field, req.body[field]);
      }
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
      finalHeaders = { ...finalHeaders, ...form.getHeaders() };
    } else {
      data = req.body;
      if (!finalHeaders['content-type']) {
        finalHeaders['content-type'] = 'application/json';
      }
    }
  
    this.logger.log(`[${method}] → ${url}`);
    this.logger.debug('Forwarded headers:', finalHeaders);
  
    const response = await firstValueFrom(
      this.httpService.request({
        url,
        method: method as any,
        data,
        headers: finalHeaders,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 30000,
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
