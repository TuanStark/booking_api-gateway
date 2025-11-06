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

@Controller('rooms')
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class RoomProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  // Public route - GET all rooms (không cần JWT)
  @Public()
  @Get()
  async getAllRooms(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const path = req.originalUrl.replace(/^\/rooms/, '');

      const result = await this.upstream.forwardRequest(
        'rooms',
        `/rooms${path}`,
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
  async proxyRoom(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const userId = (req as any).user?.sub || (req as any).user?.id;
      const path = req.originalUrl.replace(/^\/rooms/, '');

      const result = await this.upstream.forwardRequest(
        'rooms',
        `/rooms${path}`,
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

  // Handle base path /rooms (no trailing segment)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @All()
  async proxyRoomBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyRoom(req, res);
  }
}
