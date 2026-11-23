import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Donza API')
    .setDescription('Plataforma de ensino. Autenticação: `Authorization: Bearer <accessToken>` (login em `/api/auth/login`).')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
}

/** Documentação em `/api/docs` (JSON em `/api/docs-json`). Desligada em produção, salvo SWAGGER_ENABLED=true. */
export function setupSwagger(app: INestApplication, enabled: boolean) {
  if (!enabled) return false;
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, buildSwaggerConfig()), { jsonDocumentUrl: 'api/docs-json', swaggerOptions: { persistAuthorization: true } });
  return true;
}
