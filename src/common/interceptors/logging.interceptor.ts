import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

// log giúp dễ debug khi test API.
// structured JSON logs — dễ gửi vào ELK. correlationId gắn trong middleware.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, headers, ip } = req;
    const start = Date.now();
    const correlationId = req.headers['x-correlation-id'];

    this.logger.log(
      JSON.stringify({
        event: 'request_received',
        method,
        url,
        ip,
        correlationId,
        headers: {
          'user-agent': headers['user-agent'],
        },
      }),
    );

    return next.handle().pipe(
      tap(() => {
        console.log(`${method} ${url} - ${Date.now() - start}ms`);
        const elapsed = Date.now() - start;
        const res = context.switchToHttp().getResponse();
        this.logger.log(
          JSON.stringify({
            event: 'request_finished',
            method,
            url,
            statusCode: res.statusCode,
            elapsed,
            correlationId,
          }),
        );
      }),
    );
  }
}
