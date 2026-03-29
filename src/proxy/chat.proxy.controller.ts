import { Controller, All, Req, Res } from '@nestjs/common';
import * as express from 'express';
import { UpstreamService } from '../services/upstream.service';

/**
 * Proxy controller for chat-service REST endpoints.
 * WebSocket connections go directly to chat-service (not proxied).
 */
@Controller('chat')
export class ChatProxyController {
  constructor(private readonly upstream: UpstreamService) {}

  @All('conversations*')
  async proxyConversations(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.url.replace(/^\/chat/, '');
    const result = await this.upstream.forwardRequest('chat', path, req.method, req);
    res.status(result.status).json(result.data);
  }

  @All('messages*')
  async proxyMessages(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.url.replace(/^\/chat/, '');
    const result = await this.upstream.forwardRequest('chat', path, req.method, req);
    res.status(result.status).json(result.data);
  }
}
