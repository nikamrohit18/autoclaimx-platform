import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv, workshopServiceEnvSchema } from '@autoclaimx/config';

async function bootstrap() {
  const env = validateEnv(workshopServiceEnvSchema);
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(env.WORKSHOP_SERVICE_PORT);
  console.log(`🚀 workshop-service running on :${env.WORKSHOP_SERVICE_PORT}`);
}

bootstrap();
