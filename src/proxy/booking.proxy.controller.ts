import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import express from 'express';
import { UpstreamService } from '../services/upstream.service';
import { JwtAuthGuard } from '../common/guards/jwt.guard';

@Controller('booking')
@UseGuards(JwtAuthGuard) // 🔒 Bảo vệ tất cả route /booking/*
export class BookingProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  @All('*')
  async proxyBooking(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.originalUrl.replace(/^\/booking/, '');
    const result = await this.upstream.forwardRequest(
      'booking',
      `/booking${path}`,
      req.method,
      req.body,
      { authorization: req.headers['authorization'] },
    );
    res.json(result);
  }
}
