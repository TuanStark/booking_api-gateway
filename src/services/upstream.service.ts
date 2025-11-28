import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Readable } from 'stream';
import { createReadStream } from 'fs';
import type { Request } from 'express';
import FormData from 'form-data';

@Injectable()
export class UpstreamService {
  private readonly logger = new Logger(UpstreamService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) { }

  private getBaseUrl(service: string): string {
    const map: Record<string, string> = {
      auth: this.configService.get<string>('AUTH_SERVICE_URL') || 'http://auth-service:3001',
      buildings: this.configService.get<string>('BUILDING_SERVICE_URL') || 'http://building-service:3002',
      rooms: this.configService.get<string>('ROOM_SERVICE_URL') || 'http://room-service:3003',
      booking: this.configService.get<string>('BOOKING_SERVICE_URL') || 'http://booking-service:3005',
      bookings: this.configService.get<string>('BOOKING_SERVICE_URL') || 'http://booking-service:3005',
      payment: this.configService.get<string>('PAYMENT_SERVICE_URL') || 'http://payment-service:3006',
      notification: this.configService.get<string>('NOTIFICATION_SERVICE_URL') || 'http://notification-service:3007',
      post: this.configService.get<string>('POST_SERVICE_URL') || 'http://post-service:3010',
    };

    if (!map[service]) {
      throw new Error(`Unknown upstream service: ${service}`);
    }

    return map[service];
  }

  async forwardRequest(
    service: string,
    path: string,
    method: string,
    req: Request,
    extraHeaders: Record<string, string> = {},
  ): Promise<{ status: number; data: any; headers: Record<string, any> }> {
    const url = `${this.getBaseUrl(service)}${path}`;
    const upperMethod = method.toUpperCase();

    // Header whitelist – chỉ forward những cái cần thiết
    const allowedHeaders = [
      'authorization',
      'x-user-id',
      'x-request-id',
      'x-forwarded-for',
      'x-real-ip',
      'content-type',
      'accept',
      'accept-encoding',
      'accept-language',
      'cookie',
      'user-agent',
    ];

    const headers: Record<string, string> = {};

    Object.entries(req.headers).forEach(([key, value]) => {
      if (typeof value === 'string' && allowedHeaders.includes(key.toLowerCase())) {
        headers[key.toLowerCase()] = value;
      }
    });

    // Ghi đè/extra headers
    Object.assign(headers, extraHeaders);

    let data: any = undefined;
    const contentType = headers['content-type'] || '';
    const isMultipart = contentType.includes('multipart/form-data');

    this.logger.log(`[${upperMethod}] → ${url}`);

    try {
      // ==============================================
      // XỬ LÝ BODY
      // ==============================================
      if (['GET', 'HEAD'].includes(upperMethod)) {
        data = undefined;
      }

      // MULTIPART/FORM-DATA – PHIÊN BẢN HOÀN HẢO (2025)
      else if (isMultipart) {
        const form = new FormData();

        // 1. Text fields (luôn có trong req.body)
        Object.entries(req.body || {}).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            if (Array.isArray(value)) {
              value.forEach((v) => form.append(key, String(v)));
            } else {
              form.append(key, String(value));
            }
          }
        });

        // 2. Thu thập tất cả file (hỗ trợ mọi kiểu multer)
        const files: any[] = [];
        const collectFiles = (f: any) => {
          if (!f) return;
          if (Array.isArray(f)) f.forEach(collectFiles);
          else files.push(f);
        };

        if ((req as any).file) collectFiles((req as any).file);
        if ((req as any).files) collectFiles((req as any).files);

        // 3. Tạo stream đúng cách
        for (const file of files) {
          if (!file) continue;

          let stream: Readable;
          const options: any = {
            filename: file.originalname || file.filename || 'file',
            contentType: file.mimetype || 'application/octet-stream',
          };

          if (file.buffer) {
            // File nhỏ → dùng buffer (nhanh, ổn định)
            stream = Readable.from(file.buffer);
            options.knownLength = file.buffer.length;
          } else if (file.path && typeof file.path === 'string') {
            // File lớn → stream từ disk (rất ổn cho > 50MB)
            stream = createReadStream(file.path);
            if (file.size) options.knownLength = file.size;
          } else {
            continue;
          }

          form.append(file.fieldname, stream, options);
        }

        // 4. Headers từ FormData
        Object.assign(headers, form.getHeaders());

        // Quan trọng: Xóa Content-Length để dùng chunked encoding
        delete headers['content-length'];
        delete headers['Content-Length'];

        data = form;
      }

      // JSON hoặc các body khác
      else if (req.body && (Object.keys(req.body).length > 0 || req.is('json'))) {
        data = req.body;
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }

      // Xóa Content-Length một lần nữa (phòng axios thêm lại)
      delete headers['content-length'];
      delete headers['Content-Length'];

      // ==============================================
      // GỬI REQUEST
      // ==============================================
      const response = await firstValueFrom(
        this.httpService.request({
          url,
          method: upperMethod as any,
          data,
          headers,
          timeout: 300000, // 5 phút – đủ cho file 2GB+
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true, // luôn resolve
          // KHÔNG ĐỘNG VÀO transformRequest – đây là chìa khóa!
        }),
      );

      this.logger.log(`← [${response.status}] ${service}${path}`);

      return {
        status: response.status,
        data: response.data,
        headers: response.headers as Record<string, any>,
      };
    } catch (error: any) {
      this.logger.error(`Forward failed to ${service}${path}`, error.message);

      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return { status: 504, data: { message: 'Gateway Timeout' }, headers: {} };
      }

      if (error.response) {
        return {
          status: error.response.status || 502,
          data: error.response.data || { message: 'Upstream error' },
          headers: error.response.headers || {},
        };
      }

      return { status: 500, data: { message: 'Internal Gateway Error' }, headers: {} };
    }
  }
}