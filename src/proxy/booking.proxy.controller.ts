import { All, Controller, Req, Res, UseGuards, UseInterceptors, UseFilters, Get } from '@nestjs/common';
import { UpstreamService } from '../services/upstream.service';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';

@Controller('bookings')
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class BookingProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  // Public route - GET all bookings (không cần JWT)
  @Public()
  @Get()
  async getAllBookings(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const path = req.originalUrl.replace(/^\/bookings/, '');

      const result = await this.upstream.forwardRequest(
        'bookings',
        `/bookings${path}`,
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
      res.status(status).json({ error: error.message || 'Internal Gateway Error' });
    }
  }

  // Protected routes - Tất cả methods khác (cần JWT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @All('*')
  async proxyBookingAuth(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const userId = (req as any).user?.sub || (req as any).user?.id;

      const path = req.originalUrl.replace(/^\/bookings/, '');

      const result = await this.upstream.forwardRequest(
        'bookings',
        `/bookings${path}`,
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
      res.status(status).json({ error: error.message || 'Internal Gateway Error' });
    }
  }

  // Handle base path /bookings (no trailing segment)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @All()
  async proxyBookingAuthBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyBookingAuth(req, res);
  }
}