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
  constructor(private readonly upstream: UpstreamService) { }

  @Public()
  @Get(['*', ''])
  async getPublic(@Req() req: Request, @Res() res: Response) {
    await this.forward(req, res);
  }

  @UseGuards(JwtAuthGuard)
  @All(['*', ''])
  async proxyAdmin(@Req() req: Request, @Res() res: Response) {
    await this.forward(req, res);
  }

  private async forward(req: Request, res: Response) {
    try {
      let upstreamPath = req.originalUrl.match(/^\/reviews(.*)/)?.[1] || '/';
      console.log('DEBUG - Original upstreamPath:', upstreamPath);

      if (upstreamPath === '/') {
        upstreamPath = '';
      }
      console.log('DEBUG - Final upstreamPath:', upstreamPath);
      console.log('DEBUG - Final URL will be:', `/reviews${upstreamPath}`);

      const extraHeaders: Record<string, string> = {};
      if (req.headers.authorization) {
        extraHeaders.authorization = req.headers.authorization as string;
      }
      if ((req as any).user?.sub) {
        extraHeaders['x-user-id'] = (req as any).user.sub;
      } else if ((req as any).user?.id) {
        extraHeaders['x-user-id'] = (req as any).user.id;
      }

      const result = await this.upstream.forwardRequest(
        'review',
        `/reviews${upstreamPath}`,
        req.method,
        req,
        extraHeaders,
      );

      Object.entries(result.headers || {}).forEach(([key, value]) => {
        if (typeof value === 'string') {
          res.setHeader(key, value);
        }
      });

      return res.status(result.status).send(result.data);
    } catch (error: any) {
      console.error('Proxy error:', error);
      const status = error.status || 500;
      const message = error.message || 'Internal Gateway Error';
      return res.status(status).json({ message });
    }
  }
}
