import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv, baseEnvSchema } from '@autoclaimx/config';
import { z } from 'zod';

const adminEnvSchema = baseEnvSchema.extend({
  ADMIN_SERVICE_PORT: z.coerce.number().default(3003),
});

async function bootstrap() {
  const env = validateEnv(adminEnvSchema);
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(env.ADMIN_SERVICE_PORT);
  console.log(`🚀 admin-service running on :${env.ADMIN_SERVICE_PORT}`);
}

bootstrap();
