import { Controller, All, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { UpstreamService } from '../services/upstream.service';
import { JwtAuthGuard } from '../common/guards/jwt.guard';

/**
 * Proxy controller for chat-service REST endpoints.
 * WebSocket connections go directly to chat-service (not proxied).
 */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  /** path-to-regexp v8+: dùng tên splat, không dùng hậu tố `*` */
  @All('conversations')
  @All('conversations/*path')
  async proxyConversations(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.url.replace(/^\/chat/, '');
    const result = await this.upstream.forwardRequest('chat', path, req.method, req);
    res.status(result.status).json(result.data);
  }

  @All('messages')
  @All('messages/*path')
  async proxyMessages(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.url.replace(/^\/chat/, '');
    const result = await this.upstream.forwardRequest('chat', path, req.method, req);
    res.status(result.status).json(result.data);
  }
}
