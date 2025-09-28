import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import express from 'express';
import { UpstreamService } from '../services/upstream.service';
import { JwtAuthGuard } from '../common/guards/jwt.guard';

@Controller('payment')
@UseGuards(JwtAuthGuard) // 🔒 Bảo vệ tất cả route /booking/*
export class PaymentProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  @All('*')
  async proxyPayment(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.originalUrl.replace(/^\/payment/, ''); // remove prefix
    const result = await this.upstream.forwardRequest(
      'payment',
      `/payment${path}`,
      req.method,
      req.body,
      { authorization: req.headers['authorization'] },
    );
    res.json(result);
  }
}
