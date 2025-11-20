// src/controllers/building-proxy.controller.ts
import {
  All,
  Controller,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  Get,
  Header,
  StreamableFile,
  UseFilters,
} from '@nestjs/common';
import { UpstreamService } from '../services/upstream.service';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Readable } from 'stream';

@Controller('buildings')
@UseInterceptors(LoggingInterceptor)
@UseFilters(AllExceptionsFilter)
export class BuildingProxyController {
  constructor(private readonly upstream: UpstreamService) { }

  // 1. PUBLIC: GET /buildings, /buildings/search, /buildings/public/...
  @Public()
  @Get('*')
  async proxyPublic(@Req() req: Request, @Res() res: Response) {
    return this.forward(req, res, false); // false = không cần gửi x-user-id
  }

  // 2. ADMIN ONLY: Tất cả các method khác (POST, PUT, DELETE, PATCH + upload file)
  @All('*')
  @UseGuards(JwtAuthGuard, RolesGuard) // Áp dụng guard mặc định (sẽ override bằng @Public khi cần)
  @Roles('ADMIN') // Chỉ admin được dùng các route cần auth
  @UseInterceptors(AnyFilesInterceptor()) // Chỉ áp dụng cho route có upload file
  async proxyAdmin(@Req() req: Request, @Res() res: Response) {
    return this.forward(req, res, true); // true = có gửi x-user-id
  }

  // Hàm chung xử lý forward + pipe response đúng cách
  private async forward(
    req: Request,
    res: Response,
    requireAuth: boolean,
  ) {
    try {
      const authHeader = req.headers.authorization;
      const userId = requireAuth ? (req as any).user?.sub || (req as any).user?.id : undefined;

      // Xử lý path chính xác (giữ nguyên query string)
      const path = req.originalUrl.replace(/^\/buildings/, '') || '/';

      const extraHeaders: Record<string, string> = {};
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }
      if (userId) {
        extraHeaders['x-user-id'] = userId;
      }

      const result = await this.upstream.forwardRequest(
        'buildings',
        `/buildings${path}`, // upstream thường có prefix /buildings
        req.method,
        req,
        extraHeaders,
      );

      // === PIPE RESPONSE ĐÚNG CÁCH (hỗ trợ cả JSON + file stream) ===
      // Xóa các header không cần thiết
      res.removeHeader('Transfer-Encoding');
      res.removeHeader('Content-Encoding');

      // Set headers từ upstream
      Object.entries(result.headers || {}).forEach(([key, value]) => {
        if (value && !key.toLowerCase().startsWith('content-length')) {
          res.setHeader(key, value as string);
        }
      });

      // Nếu là file stream (download)
      if (result.data instanceof Readable || result.data?.pipe) {
        res.status(result.status);
        result.data.pipe(res);
        return;
      }

      // Nếu là Buffer (file nhỏ)
      if (Buffer.isBuffer(result.data)) {
        res.status(result.status);
        res.send(result.data);
        return;
      }

      // Default: JSON
      res.status(result.status).json(result.data);

    } catch (error: any) {
      console.error('Proxy error:', error);
      if (!res.headersSent) {
        res
          .status(error.status || 500)
          .json({
            message: error.message || 'Internal Gateway Error',
            statusCode: error.status || 500,
          });
      }
    }
  }
}