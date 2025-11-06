import { Injectable, NestMiddleware } from '@nestjs/common';

// security headers cơ bản.
@Injectable()
export class SecureHeadersMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('x-xss-protection', '1; mode=block');
    res.setHeader('referrer-policy', 'no-referrer');
    next();
  }
}
