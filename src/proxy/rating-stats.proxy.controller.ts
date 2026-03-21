import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseInterceptors,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { UpstreamService } from '../services/upstream.service';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';

@Controller('rating-stats')
@Public()
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class RatingStatsProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  @Get(':roomId')
  async getForRoom(
    @Param('roomId') roomId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const result = await this.upstream.forwardRequest(
        'review',
        `/rating-stats/${encodeURIComponent(roomId)}`,
        'GET',
        req,
        {},
      );

      Object.entries(result.headers || {}).forEach(([key, value]) => {
        if (typeof value === 'string') {
          res.setHeader(key, value);
        }
      });

      return res.status(result.status || 200).send(result.data);
    } catch (error: any) {
      const status = error?.status || 500;
      return res
        .status(status)
        .json({ message: error.message || 'Internal Gateway Error' });
    }
  }
}
