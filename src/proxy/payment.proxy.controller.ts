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
  Param,
  Query,
} from '@nestjs/common';
import express from 'express';
import { UpstreamService } from '../services/upstream.service';
import { GatewayPaymentService } from '../services/gateway-payment.service';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { LoggingInterceptor } from '../common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from '../common/filters/http-exception.filter';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { toPaymentServicePath } from './payment-path.util';

/** Cả /payment và /payments (MoMo/VNPay redirect URL thường dùng /payments/...) */
@Controller(['payment', 'payments'])
@UseInterceptors(LoggingInterceptor, AnyFilesInterceptor())
@UseFilters(AllExceptionsFilter)
export class PaymentProxyController {
  constructor(
    private readonly upstream: UpstreamService,
    private readonly gatewayPayment: GatewayPaymentService,
  ) {}

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

  private async forwardAuthenticatedPayment(
    req: express.Request,
    res: express.Response,
  ) {
    const authHeader = req.headers['authorization'];
    const userId =
      (req as express.Request & { user?: { sub?: string; id?: string } }).user
        ?.sub || (req as express.Request & { user?: { id?: string } }).user?.id;

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
    return res.status(status).json(result.data);
  }

  @Public()
  @Post('webhook')
  async webhook(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      const result = await this.upstream.forwardRequest(
        'payment',
        '/payments/webhook',
        req.method,
        req,
        {},
      );

      res.set(result.headers || {});
      return res.status(result.status || 200).send(result.data);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      console.error('Webhook proxy error:', error);
      return res.status(err?.status || 500).json({
        message: err?.message || 'Webhook processing failed',
      });
    }
  }

  @Public()
  @Post('payos/webhook')
  async payosWebhook(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      const result = await this.upstream.forwardRequest(
        'payment',
        '/payments/payos/webhook',
        req.method,
        req,
        {},
      );
      res.set(result.headers || {});
      return res.status(result.status || 200).send(result.data);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      return res.status(err?.status || 500).json({
        message: err?.message || 'Webhook processing failed',
      });
    }
  }

  @Public()
  @Get('momo/return')
  async momoReturn(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      return res
        .status(err?.status || 500)
        .json({ error: err?.message || 'Gateway error' });
    }
  }

  @Public()
  @Post('momo/ipn')
  async momoIpn(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      return res
        .status(err?.status || 500)
        .json({ error: err?.message || 'Gateway error' });
    }
  }

  @Public()
  @Get('vnpay/return')
  async vnpayReturn(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      return res
        .status(err?.status || 500)
        .json({ error: err?.message || 'Gateway error' });
    }
  }

  @Public()
  @Get('vnpay/ipn')
  async vnpayIpnGet(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      return await this.forwardPublicPayment(req, res);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      return res
        .status(err?.status || 500)
        .json({ error: err?.message || 'Gateway error' });
    }
  }

  /* ---- JWT: route cụ thể phải khai báo trước :id và trước All ---- */

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('stats')
  async proxyStats(@Req() req: express.Request, @Res() res: express.Response) {
    return this.forwardAuthenticatedPayment(req, res);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('revenue/monthly')
  async proxyMonthlyRevenue(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    return this.forwardAuthenticatedPayment(req, res);
  }

  /** Danh sách: enrich user từ auth-service */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  async listPaymentsEnriched(
    @Req() req: express.Request,
    @Res() res: express.Response,
    @Query() query: Record<string, unknown>,
  ) {
    const token = (req.headers['authorization'] as string) || '';
    const payload = await this.gatewayPayment.getAllPayments(token, query);
    return res.status(200).json(payload);
  }

  /** Chi tiết một giao dịch: enrich user */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  async getPaymentDetailEnriched(
    @Param('id') id: string,
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const token = (req.headers['authorization'] as string) || '';
    const userId =
      (req as express.Request & { user?: { sub?: string; id?: string } }).user
        ?.sub ||
      (req as express.Request & { user?: { id?: string } }).user?.id ||
      '';
    const payload = await this.gatewayPayment.getDetailPayment(
      userId,
      id,
      token,
    );
    return res.status(200).json(payload);
  }

  /** POST tạo thanh toán, PUT, DELETE, … */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @All(['*', ''])
  async proxyPayment(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    try {
      return await this.forwardAuthenticatedPayment(req, res);
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      return res
        .status(err?.status || 500)
        .json({ error: err?.message || 'Internal Gateway Error' });
    }
  }
}
