import { All, Controller, Req, Res } from '@nestjs/common';
import { UpstreamService } from '../services/upstream.service';
import express from 'express';

@Controller(['auth', 'auths']) // Hỗ trợ cả /auth và /auths
export class AuthProxyController {
  constructor(private readonly upstream: UpstreamService) { }

  @All(['*', ''])
  async proxyAuth(@Req() req: express.Request, @Res() res: express.Response) {
    console.log('🔍 Request received:', {
      method: req.method,
      url: req.originalUrl,
      headers: req.headers,
      body: req.body,
    });

    try {
      // Xử lý path để forward đúng đến auth-service
      // Auth-service có 2 controllers:
      //   - @Controller('auth') → /auth/login, /auth/register, etc. (phải giữ /auth prefix)
      //   - @Controller('user') → /user/:id, /user/profile, etc. (không có /auth prefix)
      let path = req.originalUrl;

      // Chỉ remove /auth prefix nếu path là /auth/user/... hoặc /auths/user/...
      // Các path khác như /auth/login, /auth/register → giữ nguyên
      if (path.startsWith('/auth/user') || path.startsWith('/auths/user')) {
        path = path.replace(/^\/auths?/, '');
      }
      // Nếu không có /auth prefix (đã remove) thì giữ nguyên
      // Ví dụ: /auth/login → giữ nguyên → /auth/login ✅

      // Đảm bảo path luôn bắt đầu bằng /
      if (!path.startsWith('/')) {
        path = '/' + path;
      }

      console.log('🔄 Forwarding to auth-service:', path);

      const result = await this.upstream.forwardRequest(
        'auth',
        path,
        req.method,
        req,
      );

      console.log('✅ Response received:', result.status);
      res.json(result);
    } catch (error) {
      console.error('❌ Proxy error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
