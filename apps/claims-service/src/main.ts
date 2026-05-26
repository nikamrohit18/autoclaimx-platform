import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv, claimsServiceEnvSchema } from '@autoclaimx/config';

async function bootstrap() {
  const env = validateEnv(claimsServiceEnvSchema);

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api/v1');

  await app.listen(env.CLAIMS_SERVICE_PORT);
  console.log(`🚀 claims-service running on :${env.CLAIMS_SERVICE_PORT}`);
}

bootstrap();
