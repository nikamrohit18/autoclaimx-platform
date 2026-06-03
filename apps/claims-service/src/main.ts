import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnv, claimsServiceEnvSchema } from '@autoclaimx/config';

async function bootstrap() {
  const env = validateEnv(claimsServiceEnvSchema);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const doc = new DocumentBuilder()
    .setTitle('AutoClaimX — Claims Service')
    .setDescription('FNOL creation, claim lifecycle, media upload, damage reports, fraud scores, and analytics')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-internal-service-secret' }, 'service-secret')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(env.CLAIMS_SERVICE_PORT);
  app.get(Logger).log(`claims-service running on :${env.CLAIMS_SERVICE_PORT}`);
  app.get(Logger).log(`Swagger docs at http://localhost:${env.CLAIMS_SERVICE_PORT}/api/docs`);
}

bootstrap();
