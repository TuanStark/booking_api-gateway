import { Controller, All, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { UpstreamService } from '../services/upstream.service';
import { JwtAuthGuard } from '../common/guards/jwt.guard';

/**
 * Proxy controller for chat-service REST endpoints.
 * WebSocket connections go directly to chat-service (not proxied).
 *
 * Clients typically send only `Authorization`; chat-service expects `x-user-id` / `x-user-role`
 * (same pattern as review/building proxies).
 */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatProxyController {
  constructor(private readonly upstream: UpstreamService) { }

  private identityHeaders(req: express.Request): Record<string, string> {
    const extra: Record<string, string> = {};
    const user = (req as any).user as
      | { sub?: string; id?: string; role?: string; roleName?: string }
      | undefined;
    if (user?.sub) {
      extra['x-user-id'] = String(user.sub);
    } else if (user?.id) {
      extra['x-user-id'] = String(user.id);
    }
    const rawRole = user?.role ?? user?.roleName;
    if (rawRole != null && String(rawRole).trim() !== '') {
      extra['x-user-role'] = String(rawRole).toLowerCase();
    }
    return extra;
  }

  /** path-to-regexp v8+: dùng tên splat, không dùng hậu tố `*` */
  @All('conversations')
  @All('conversations/*path')
  async proxyConversations(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.url.replace(/^\/chat/, '');
    const result = await this.upstream.forwardRequest(
      'chat',
      path,
      req.method,
      req,
      this.identityHeaders(req),
    );
    res.status(result.status).json(result.data);
  }

  @All('messages')
  @All('messages/*path')
  async proxyMessages(@Req() req: express.Request, @Res() res: express.Response) {
    const path = req.url.replace(/^\/chat/, '');
    const result = await this.upstream.forwardRequest(
      'chat',
      path,
      req.method,
      req,
      this.identityHeaders(req),
    );
    res.status(result.status).json(result.data);
  }
}
