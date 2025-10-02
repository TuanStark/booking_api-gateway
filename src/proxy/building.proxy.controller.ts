import { All, Controller, Req, Res, UseGuards, UseInterceptors, UseFilters } from '@nestjs/common';
import { UpstreamService } from '../services/upstream.service';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

@Controller('buildings')
// @UseGuards(JwtAuthGuard)
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class BuildingProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  @All('*')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    try {
      // ✅ Logging handled by interceptor; auth handled by guard
      const authHeader = req.headers['authorization'];

      // ✅ Build path
      const path = req.originalUrl.replace(/^\/buildings/, '');

      // ✅ Forward request (including multipart/form-data if any)
      const result = await this.upstream.forwardRequest(
        'buildings',
        `/buildings${path}`,
        req.method,
        req, // truyền luôn request để handle file
        { authorization: authHeader },
      );

      res.set(result.headers || {});
      res.status(result.status || 200).json(result.data);
    } catch (error) {
      // ✅ Error normalization handled by filter; still fallback here
      const status = (error && error.status) || 500;
      res.status(status).json({ error: error.message || 'Internal Gateway Error' });
    }
  }

  // Handle base path /buildings (no trailing segment)
  @All()
  async proxyAuthBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyAuth(req, res);
  }
}
