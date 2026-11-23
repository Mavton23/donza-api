import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/pipes/validation.pipe';
import { setupSwagger } from './common/swagger';

async function bootstrap() {
  // rawBody: necessário para verificar assinaturas de webhooks (HMAC sobre o corpo cru)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  if (config.get<string>('TRUST_PROXY') === '1') app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: (config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  setupSwagger(app, config.get<string>('NODE_ENV') !== 'production' || config.get<string>('SWAGGER_ENABLED') === 'true');

  const port = config.get<number>('PORT') ?? 3001;
  await app.listen(port);
  new Logger('Bootstrap').log(`API a correr em http://localhost:${port}/api`);
}

void bootstrap();
