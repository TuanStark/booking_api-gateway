import { Injectable, NestMiddleware } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';


// correlation id giúp trace xuyên suốt từ gateway tới services (log, tracing).
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const header = req.headers['x-correlation-id'] || req.headers['x-request-id'];
    const id = header || uuidv4();
    req.headers['x-correlation-id'] = id;
    res.setHeader('x-correlation-id', id);
    next();
  }
}
