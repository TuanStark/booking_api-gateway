import {
  All,
  Controller,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UseFilters,
  Get,
  Post,
} from '@nestjs/common';
import express from 'express';
import { UpstreamService } from '../services/upstream.service';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { toPaymentServicePath } from './payment-path.util';

/** Cả /payment và /payments (MoMo/VNPay redirect URL thường dùng /payments/...) */
@Controller(['payment', 'payments'])
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class PaymentProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  /** Forward GET/POST công khai tới payment-service (redirect MoMo/VNPay, IPN, …) */
  private async forwardPublicPayment(
    req: express.Request,
    res: express.Response,
  ) {
    const upstreamPath = toPaymentServicePath(req.originalUrl);
    const authHeader = req.headers['authorization'];
    const extraHeaders: Record<string, string> = {};
    if (authHeader) {
      extraHeaders.authorization = authHeader;
    }
    const result = await this.upstream.forwardRequest(
      'payment',
      upstreamPath,
      req.method,
      req,
      extraHeaders,
    );
    res.set(result.headers || {});
    const status = result.status || 200;
    const loc = result.headers?.location;
    if (status >= 300 && status < 400 && loc) {
      return res.redirect(status, String(loc));
    }
    return res.status(status).send(result.data);
  }

  @Public()
  @Post('webhook')
  async webhook(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      const result = await this.upstream.forwardRequest(
        'payment',
        '/payments/webhook',
        req.method,
        req, // raw body needed for signature verification!
        {}, // no extra headers usually
      );

      // Important: forward headers like content-type, stripe-signature, etc.
      res.set(result.headers || {});
      return res.status(result.status || 200).send(result.data);
    } catch (error: any) {
      console.error('Webhook proxy error:', error);
      return res.status(error?.status || 500).json({
        message: error?.message || 'Webhook processing failed',
      });
    }
  }

  /** MoMo redirect browser — route cụ thể (tránh wildcard Nest không khớp nhiều segment) */
  @Public()
  @Get('momo/return')
  async momoReturn(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: any) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Gateway error' });
    }
  }

  @Public()
  @Post('momo/ipn')
  async momoIpn(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: any) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Gateway error' });
    }
  }

  @Public()
  @Get('vnpay/return')
  async vnpayReturn(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: any) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Gateway error' });
    }
  }

  @Public()
  @Get('vnpay/ipn')
  async vnpayIpnGet(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: any) {
      return res
        .status(error?.status || 500)
        .json({ error: error?.message || 'Gateway error' });
    }
  }

  // Public route - GET all payments (không cần JWT)
  @Public()
  @Get(['*', ''])
  async getAllPayments(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      const authHeader = req.headers['authorization'];
      const upstreamPath = toPaymentServicePath(req.originalUrl);

      const extraHeaders: Record<string, string> = {};
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }

      const result = await this.upstream.forwardRequest(
        'payment',
        upstreamPath,
        req.method,
        req,
        extraHeaders,
      );

      res.set(result.headers || {});
      const status = result.status || 200;
      const loc = result.headers?.location;
      if (status >= 300 && status < 400 && loc) {
        return res.redirect(status, String(loc));
      }
      res.status(status).json(result.data);
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
  async proxyPayment(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      const authHeader = req.headers['authorization'];
      const userId = (req as any).user?.sub || (req as any).user?.id;

      const upstreamPath = toPaymentServicePath(req.originalUrl);

      const extraHeaders: Record<string, string> = {};
      if (authHeader) {
        extraHeaders.authorization = authHeader;
      }
      if (userId) {
        extraHeaders['x-user-id'] = userId;
      }

      const result = await this.upstream.forwardRequest(
        'payment',
        upstreamPath,
        req.method,
        req,
        extraHeaders,
      );

      res.set(result.headers || {});
      const status = result.status || 200;
      const loc = result.headers?.location;
      if (status >= 300 && status < 400 && loc) {
        return res.redirect(status, String(loc));
      }
      res.status(status).json(result.data);
    } catch (error) {
      const status = (error && error.status) || 500;
      res
        .status(status)
        .json({ error: error.message || 'Internal Gateway Error' });
    }
  }

  // Handle base path /payment (no trailing segment)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @All()
  async proxyPaymentBase(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    return this.proxyPayment(req, res);
  }
}
