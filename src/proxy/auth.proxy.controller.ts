import { All, Controller, Req, Res } from '@nestjs/common';
import { UpstreamService } from '../services/upstream.service';
import express from 'express';

@Controller('auth')
export class AuthProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  @All('*')
  async proxyAuth(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.originalUrl.replace(/^\/auth/, ''); // remove prefix
    const result = await this.upstream.forwardRequest(
      'auth',
      `/auth${path}`,
      req.method,
      req.body,
      { authorization: req.headers['authorization'] },
    );
    res.json(result);
  }
}
