import type { IncomingMessage } from 'http';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { json, urlencoded, type Request, type Response, type NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

type SocketIoProxy = ReturnType<typeof createProxyMiddleware<Request, Response>> & {
  upgrade: (req: IncomingMessage, socket: unknown, head: Buffer) => void;
};

function applyCrossOriginHeaders(req: IncomingMessage, res: Response): void {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}

function socketIoOptionsMiddleware(req: Request, res: Response, next: NextFunction) {
  const path = req.originalUrl || req.url || '';
  if (!path.startsWith('/socket.io')) return next();
  if (req.method !== 'OPTIONS') return next();
  applyCrossOriginHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  const reqHdr = req.headers['access-control-request-headers'];
  if (typeof reqHdr === 'string') res.setHeader('Access-Control-Allow-Headers', reqHdr);
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
}

async function bootstrap() {
  const bootLogger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });

  app.enableCors({
    origin: (origin, callback) => {
      const allowed = new Set([
        'https://dorm.tuanstark.id.vn',
        'https://dorm-admin.tuanstark.id.vn',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ]);
      if (!origin || allowed.has(origin)) {
        callback(null, origin ?? true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  const chatServiceUrl =
    process.env.CHAT_SERVICE_URL || 'http://chat-service:3013';

  bootLogger.log(`Socket.IO proxy target: ${chatServiceUrl}`);
  if (/chat-service/i.test(chatServiceUrl)) {
    bootLogger.warn(
      'CHAT_SERVICE_URL trỏ tới hostname Docker (chat-service). Chỉ resolve được trong network compose; gateway chạy trên host Windows cần http://127.0.0.1:3013.',
    );
  }

  const socketIoProxy = createProxyMiddleware<Request, Response>({
    pathFilter: '/socket.io',
    target: chatServiceUrl,
    changeOrigin: true,
    ws: false,
    timeout: 90_000,
    proxyTimeout: 90_000,
    on: {
      proxyRes: (proxyRes, req, res) => {
        const origin = req.headers.origin;
        if (origin && !proxyRes.headers['access-control-allow-origin']) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Vary', 'Origin');
        }
      },
      error: (err, req, res, _target) => {
        bootLogger.error(
          `Socket.IO proxy → ${chatServiceUrl}: ${err.message}`,
        );
        const out = res as Response;
        if (typeof out.writeHead !== 'function' || out.headersSent) return;
        applyCrossOriginHeaders(req as IncomingMessage, out);
        out.writeHead(502, { 'Content-Type': 'application/json' });
        out.end(
          JSON.stringify({
            statusCode: 502,
            message:
              'Socket.IO upstream unreachable. Kiểm tra chat-service (port 3013) và CHAT_SERVICE_URL.',
          }),
        );
      },
    },
  }) as SocketIoProxy;

  app.use(socketIoOptionsMiddleware);
  app.use(socketIoProxy);

  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));

  app.use(cookieParser());
  app.useGlobalInterceptors(new LoggingInterceptor());
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  const httpServer = app.getHttpServer();
  httpServer.on('upgrade', (req, socket, head) => {
    const url = req.url ?? '';
    if (!url.startsWith('/socket.io')) return;
    socketIoProxy.upgrade(req, socket, head);
  });
  bootLogger.log(`API Gateway running on ${port}`);
}
bootstrap();
