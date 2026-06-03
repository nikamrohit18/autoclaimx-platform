import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnv, baseEnvSchema } from '@autoclaimx/config';
import { z } from 'zod';

const adminEnvSchema = baseEnvSchema.extend({
  ADMIN_SERVICE_PORT: z.coerce.number().default(3003),
});

async function bootstrap() {
  const env = validateEnv(adminEnvSchema);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const doc = new DocumentBuilder()
    .setTitle('AutoClaimX — Admin Service')
    .setDescription('Tenant management, user CRUD, and RBAC')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-internal-service-secret' }, 'service-secret')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(env.ADMIN_SERVICE_PORT);
  app.get(Logger).log(`admin-service running on :${env.ADMIN_SERVICE_PORT}`);
  app.get(Logger).log(`Swagger docs at http://localhost:${env.ADMIN_SERVICE_PORT}/api/docs`);
}

bootstrap();
