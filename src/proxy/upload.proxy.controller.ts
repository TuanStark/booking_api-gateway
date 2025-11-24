import {
  All,
  Controller,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UseFilters,
  Get,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UpstreamService } from '../services/upstream.service';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('uploads')
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class UploadProxyController {
  constructor(private readonly upstream: UpstreamService) { }

  // Public route - GET all uploads (không cần JWT)
  @Public()
  @Get(['*', ''])
  async getAllUploads(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const path = req.originalUrl.replace(/^\/uploads/, '');

      const extraHeaders: Record<string, string> = {};
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }

      const result = await this.upstream.forwardRequest(
        'uploads',
        `/uploads${path}`,
        req.method,
        req,
        extraHeaders,
      );

      res.set(result.headers || {});
      res.status(result.status || 200).json(result.data);
    } catch (error) {
      const status = (error && error.status) || 500;
      res
        .status(status)
        .json({ error: error.message || 'Internal Gateway Error' });
    }
  }

  // Protected routes - Tất cả methods khác (cần JWT + Admin role)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @All(['*', ''])
  async proxyUpload(@Req() req: Request, @Res() res: Response) {
    try {
      const userId = (req as any).user?.sub || (req as any).user?.id;
      const path = req.originalUrl.replace(/^\/uploads/, '');

      const extraHeaders: Record<string, string> = {};
      if (req.headers['authorization']) {
        extraHeaders.authorization = req.headers['authorization'];
      }
      if (userId) {
        extraHeaders['x-user-id'] = userId;
      }

      const result = await this.upstream.forwardRequest(
        'uploads',
        `/uploads${path}`,
        req.method,
        req,
        extraHeaders,
      );

      res.set(result.headers || {});
      res.status(result.status || 200).json(result.data);
    } catch (error) {
      const status = (error && error.status) || 500;
      res
        .status(status)
        .json({ error: error.message || 'Internal Gateway Error' });
    }
  }

  // Handle base path /uploads (no trailing segment)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @All()
  async proxyUploadBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyUpload(req, res);
  }
}
