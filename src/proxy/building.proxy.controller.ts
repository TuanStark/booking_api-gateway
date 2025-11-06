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
import { UpstreamService } from '../services/upstream.service';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('buildings')
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class BuildingProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  // Public route - GET all buildings (không cần JWT)
  @Public()
  @Get()
  async getAllBuildings(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const path = req.originalUrl.replace(/^\/buildings/, '');

      const result = await this.upstream.forwardRequest(
        'buildings',
        `/buildings${path}`,
        req.method,
        req,
        {
          authorization: authHeader,
        },
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
  @All('*')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const userId = (req as any).user?.sub || (req as any).user?.id;
      const path = req.originalUrl.replace(/^\/buildings/, '');

      const result = await this.upstream.forwardRequest(
        'buildings',
        `/buildings${path}`,
        req.method,
        req,
        {
          authorization: authHeader,
          'x-user-id': userId,
        },
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

  // Handle base path /buildings (no trailing segment)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @All()
  async proxyAuthBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyAuth(req, res);
  }
}
