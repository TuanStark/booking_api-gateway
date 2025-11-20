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
  private readonly logger = new Logger(UpstreamService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private getBaseUrl(service: string): string {
    const map: Record<string, string> = {
      auth: this.configService.get<string>('AUTH_SERVICE_URL') || 'http://auth-service:3001',
      buildings: this.configService.get<string>('BUILDING_SERVICE_URL') || 'http://building-service:3002',
      rooms: this.configService.get<string>('ROOM_SERVICE_URL') || 'http://room-service:3003',
      booking: this.configService.get<string>('BOOKING_SERVICE_URL') || 'http://booking-service:3005',
      bookings: this.configService.get<string>('BOOKING_SERVICE_URL') || 'http://booking-service:3005',
      payment: this.configService.get<string>('PAYMENT_SERVICE_URL') || 'http://payment-service:3006',
      notification: this.configService.get<string>('NOTIFICATION_SERVICE_URL') || 'http://notification-service:3007',
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

    // Whitelist headers được phép forward
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
    ];

    const headers: Record<string, string> = {};

    // Copy headers từ request gốc (chỉ lấy những cái được phép)
    Object.entries(req.headers).forEach(([key, value]) => {
      if (typeof value === 'string' && allowedHeaders.includes(key.toLowerCase())) {
        headers[key] = value;
      }
    });

    // Ghi đè/extra headers
    Object.assign(headers, extraHeaders);

    let data: any = undefined;
    const isMultipart = headers['content-type']?.includes('multipart/form-data');

    this.logger.log(`[${upperMethod}] → ${url}`);

    try {
      // ==============================================
      // XỬ LÝ BODY
      // ==============================================
      if (['GET', 'HEAD', 'DELETE'].includes(upperMethod)) {
        data = undefined;
      }
      // MULTIPART/FORM-DATA (có file)
      else if (isMultipart) {
        const form = new FormData();

        // Text fields
        if (req.body && typeof req.body === 'object') {
          Object.keys(req.body).forEach((key) => {
            const value = req.body[key];
            if (value !== undefined && value !== null) {
              form.append(key, value);
            }
          });
        }

        // Files: hỗ trợ req.file, req.files (array), req.files[field] (object)
        const files: any[] = [];

        if ((req as any).file) files.push((req as any).file);
        if (Array.isArray((req as any).files)) files.push(...(req as any).files);
        if ((req as any).files && typeof (req as any).files === 'object') {
          Object.values((req as any).files).forEach((arr: any) => {
            files.push(...(Array.isArray(arr) ? arr : [arr]));
          });
        }

        for (const file of files) {
          if (file?.buffer) {
            const stream = Readable.from(file.buffer);
            form.append(file.fieldname, stream, {
              filename: file.originalname || file.filename || 'file',
              contentType: file.mimetype || 'application/octet-stream',
              knownLength: file.size, // QUAN TRỌNG: giúp form-data tính đúng Content-Length
            });
          }
        }

        data = form;
        Object.assign(headers, form.getHeaders());

        // BẮT BUỘC: XÓA Content-Length để dùng chunked encoding
        // Nếu không xóa → axios + form-data cũ sẽ gửi sai length → request aborted
        delete headers['content-length'];
        delete headers['Content-Length'];
      }
      // JSON hoặc các body khác
      else if (req.body && (Object.keys(req.body).length > 0 || req.is('json'))) {
        data = req.body;
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }
      // Body rỗng (một số PUT, PATCH, DELETE...)

      // ==============================================
      // GỬI REQUEST QUA AXIOS
      // ==============================================
      // Đảm bảo không có Content-Length sai (axios sẽ tự tính)
      delete headers['content-length'];
      delete headers['Content-Length'];

      const response = await firstValueFrom(
        this.httpService.request({
          url,
          method: upperMethod as any,
          data,
          headers,
          timeout: 120000, // 2 phút cho upload file lớn
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          validateStatus: () => true, // luôn resolve

          // QUAN TRỌNG: ngăn axios tự động can thiệp vào body khi dùng FormData
          transformRequest: isMultipart ? [(data: any) => data] : undefined,
        }),
      );

      this.logger.log(`← [${response.status}] from ${service}`);

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
          status: error.response.status,
          data: error.response.data || { message: 'Upstream error' },
          headers: error.response.headers,
        };
      }

      return { status: 500, data: { message: 'Internal Gateway Error' }, headers: {} };
    }
  }
}