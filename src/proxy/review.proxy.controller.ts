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

@Controller('reviews')
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class ReviewProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  // Public route - GET all reviews (không cần JWT)
  @Public()
  @Get()
  async getAllReviews(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const path = req.originalUrl.replace(/^\/reviews/, '');

      const extraHeaders: Record<string, string> = {};
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }

      const result = await this.upstream.forwardRequest(
        'reviews',
        `/reviews${path}`,
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
  @All('*')
  async proxyReview(@Req() req: Request, @Res() res: Response) {
    try {
      const userId = (req as any).user?.sub || (req as any).user?.id;
      const path = req.originalUrl.replace(/^\/reviews/, '');

      const extraHeaders: Record<string, string> = {};
      const authHeader = req.headers['authorization'];
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }
      if (userId) {
        extraHeaders['x-user-id'] = userId;
      }

      const result = await this.upstream.forwardRequest(
        'reviews',
        `/reviews${path}`,
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

  // Handle base path /reviews (no trailing segment)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @All()
  async proxyReviewBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyReview(req, res);
  }
}
