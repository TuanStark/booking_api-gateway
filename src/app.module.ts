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

@Module({
  imports: [
    HttpModule,
    ThrottlerModule.forRoot([{
      ttl: Number(process.env.RATE_LIMIT_TTL || 60) * 1000, // Convert to milliseconds
      limit: Number(process.env.RATE_LIMIT_REQ || 100),
    }]),
    ConfigModule.forRoot({
      isGlobal: true, // 👈 đảm bảo ConfigService có thể dùng ở mọi nơi
    }),
  ],
  controllers: [AuthProxyController, BookingProxyController, PaymentProxyController, BuildingProxyController],
  providers: [AppConfigService, UpstreamService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, SecureHeadersMiddleware)
      .forRoutes('*');
  }
}
