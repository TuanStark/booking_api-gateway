import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppConfigService } from './config/config.service';
import { UpstreamService } from './services/upstream.service';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { SecureHeadersMiddleware } from './common/middleware/secure-headers.middleware';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthProxyController } from './proxy/auth.proxy.controller';
import { BookingProxyController } from './proxy/booking.proxy.controller';
import { PaymentProxyController } from './proxy/payment.proxy.controller';
import { ConfigModule } from '@nestjs/config';
import { BuildingProxyController } from './proxy/building.proxy.controller';
import { RoomProxyController } from './proxy/room.proxy.controller';
import { PostProxyController } from './proxy/post.proxy.controller';
import { PostCategoriesProxyController } from './proxy/post-categories.proxy.controller';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppController } from './app.controller';

@Module({
  imports: [
    HttpModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_TTL || 60) * 1000, // Convert to milliseconds
        limit: Number(process.env.RATE_LIMIT_REQ || 100),
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true, // 👈 đảm bảo ConfigService có thể dùng ở mọi nơi
    }),
  ],
  controllers: [
    AppController,
    AuthProxyController,
    BookingProxyController,
    PaymentProxyController,
    BuildingProxyController,
    RoomProxyController,
    PostProxyController,
    PostCategoriesProxyController,
  ],
  providers: [AppConfigService, UpstreamService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, SecureHeadersMiddleware)
      .forRoutes('*');
  }
}
