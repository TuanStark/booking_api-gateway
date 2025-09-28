import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
