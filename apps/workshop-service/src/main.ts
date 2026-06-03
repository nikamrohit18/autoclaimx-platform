import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnv, workshopServiceEnvSchema } from '@autoclaimx/config';

async function bootstrap() {
  const env = validateEnv(workshopServiceEnvSchema);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  const doc = new DocumentBuilder()
    .setTitle('AutoClaimX — Workshop Service')
    .setDescription('Workshops, OCR estimate upload, and AI negotiation sessions')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-internal-service-secret' }, 'service-secret')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(env.WORKSHOP_SERVICE_PORT);
  app.get(Logger).log(`workshop-service running on :${env.WORKSHOP_SERVICE_PORT}`);
  app.get(Logger).log(`Swagger docs at http://localhost:${env.WORKSHOP_SERVICE_PORT}/api/docs`);
}

bootstrap();
