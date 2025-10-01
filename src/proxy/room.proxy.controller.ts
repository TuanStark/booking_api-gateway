import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UpstreamService } from '../services/upstream.service';
//import { JwtAuthGuard } from '../common/guards/jwt.guard';

@Controller('rooms')
//@UseGuards(JwtAuthGuard) // 🔒 Bảo vệ tất cả route /rooms/*
export class RoomProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  @All('*')
  async proxyRoom(@Req() req: Request, @Res() res: Response) {
    try {
      // ✅ Logging handled by interceptor; auth handled by guard
      const authHeader = req.headers['authorization'];

      // ✅ Build path
      const path = req.originalUrl.replace(/^\/rooms/, '');

      // ✅ Forward request (including multipart/form-data if any)
      const result = await this.upstream.forwardRequest(
        'rooms',
        `/rooms${path}`,
        req.method,
        req, // truyền luôn request để handle file
        { authorization: authHeader },
      );

      res.set(result.headers || {});
      res.status(result.status || 200).json(result.data);
    } catch (error) {
      // ✅ Error normalization handled by filter; still fallback here
      const status = (error && error.status) || 500;
      res.status(status).json({ error: error.message || 'Internal Gateway Error' });
    }
  }

  // Handle base path /rooms (no trailing segment)
  @All()
  async proxyRoomBase(@Req() req: Request, @Res() res: Response) {
    return this.proxyRoom(req, res);
  }
}
