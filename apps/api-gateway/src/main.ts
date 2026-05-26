import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnv, apiGatewayEnvSchema } from '@autoclaimx/config';

async function bootstrap() {
  const env = validateEnv(apiGatewayEnvSchema);

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', ...(env.NODE_ENV === 'development' ? ['debug' as const] : [])],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: env.NODE_ENV === 'production' ? ['https://app.autoclaimx.com', 'https://workshop.autoclaimx.com'] : true,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  await app.listen(env.API_GATEWAY_PORT);
  console.log(`🚀 api-gateway running on :${env.API_GATEWAY_PORT}`);
}

bootstrap();
