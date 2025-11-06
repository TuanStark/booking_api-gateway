import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Tắt body parser mặc định để tự cấu hình
  });

  // Cấu hình body parser với giới hạn 50MB
  app.use(json({ limit: '100mb' }));
  app.use(urlencoded({ extended: true, limit: '100mb' }));

  //CORS mở cho frontend.
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // LoggingInterceptor để log tất cả request/response.
  app.use(cookieParser());
  app.useGlobalInterceptors(new LoggingInterceptor());
  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  console.log(`API Gateway running on ${port}`);
}
bootstrap();
