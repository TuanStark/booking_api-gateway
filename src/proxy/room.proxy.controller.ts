import {
  All,
  Controller,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UseFilters,
  Get,
  UnauthorizedException,
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

@Controller('rooms')
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class RoomProxyController {
  constructor(private readonly upstream: UpstreamService) { }

  // === PUBLIC: Tất cả GET requests (không cần JWT) ===
  @Public()
  @Get(['*', ''])
  async handlePublicGet(@Req() req: Request, @Res() res: Response) {
    await this.forward(req, res, { requireAuth: false });
  }

  // === ADMIN: Tất cả các method khác (POST, PUT, DELETE, PATCH, ...) ===
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @All(['*', '']) // Bắt tất cả method + path, trừ những route đã định nghĩa trước
  async handleAdminProxy(@Req() req: Request, @Res() res: Response) {
    await this.forward(req, res, { requireAuth: true });
  }

  // === Helper: Forward request với cấu hình linh hoạt ===
  private async forward(
    req: Request,
    res: Response,
    { requireAuth }: { requireAuth: boolean },
  ) {
    try {
      const path = req.originalUrl.replace(/^\/rooms/, '') || '/';
      const extraHeaders: Record<string, string> = {};

      if (requireAuth) {
        const userId = (req as any).user?.sub;
        if (!userId) throw new UnauthorizedException('Invalid JWT');
        extraHeaders['x-user-id'] = userId;
      }

      // Không cần thêm 'authorization' vào extraHeaders → đã có trong req.headers
      const result = await this.upstream.forwardRequest(
        'rooms',
        `/rooms${path}`,
        req.method,
        req,
        extraHeaders,
      );

      Object.entries(result.headers || {}).forEach(([k, v]) => {
        if (v) res.setHeader(k, v as string);
      });

      res.status(result.status || 200).json(result.data);
    } catch (error: any) {
      const status = error.status || 500;
      res.status(status).json({
        error: error.message || 'Internal Gateway Error',
      });
    }
  }
}