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
import { GatewayBookingService } from '../services/gateway-booking.service';
import { Param, Query } from '@nestjs/common';
import { ResponseData } from '../common/global/globalClass';
import { HttpMessage, HttpStatus } from '../common/global/globalEnum';

@Controller('bookings')
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class BookingProxyController {
  constructor(
    private readonly upstream: UpstreamService,
    private readonly gatewayBookingService: GatewayBookingService,
  ) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('my-bookings')
  async getMyBookings(@Req() req: Request) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    const token = req.headers['authorization'] || '';
    const bookings = await this.gatewayBookingService.getMyBookings(userId, token);
    return new ResponseData(bookings, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  async getBookingDetail(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    const token = req.headers['authorization'] || '';
    const booking = await this.gatewayBookingService.getDetailBooking(userId, id, token);
    return new ResponseData(booking, HttpStatus.SUCCESS, HttpMessage.SUCCESS);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  async getRootBookings(@Query() query: any, @Req() req: Request) {
    const token = req.headers['authorization'] || '';
    return await this.gatewayBookingService.getAllBookings(token, query);
  }

  // Public route - GET all bookings (không cần JWT)
  @Public()
  @Get(['*', ''])
  async getAllBookings(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const path = req.originalUrl.replace(/^\/bookings/, '');

      const extraHeaders: Record<string, string> = {};
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }

      const result = await this.upstream.forwardRequest(
        'bookings',
        `/bookings${path}`,
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

  // Protected routes - Tất cả methods khác (cần JWT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @All(['*', ''])
  async proxyBookingAuth(@Req() req: Request, @Res() res: Response) {
    try {
      const authHeader = req.headers['authorization'];
      const userId = (req as any).user?.sub || (req as any).user?.id;

      const path = req.originalUrl.replace(/^\/bookings/, '');

      const extraHeaders: Record<string, string> = {};
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }
      if (userId) {
        extraHeaders['x-user-id'] = userId;
      }

      const result = await this.upstream.forwardRequest(
        'bookings',
        `/bookings${path}`,
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

  // Handle base path /bookings (no trailing segment)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @All()
  async proxyBookingAuthBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyBookingAuth(req, res);
  }
}
