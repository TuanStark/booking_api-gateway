import { Injectable, NestMiddleware } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Request, Response, NextFunction } from 'express';

// correlation id giúp trace xuyên suốt từ gateway tới services (log, tracing).
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const header =
      req.headers['x-correlation-id'] || req.headers['x-request-id'];
    const id = header || uuidv4();

    // ✅ Attach to request object instead of modifying headers
    (req as any).correlationId = id;
    res.setHeader('x-correlation-id', id);
    next();
  }
}
