import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validateEnv, apiGatewayEnvSchema } from '@autoclaimx/config';

async function bootstrap() {
  const env = validateEnv(apiGatewayEnvSchema);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

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

  const doc = new DocumentBuilder()
    .setTitle('AutoClaimX — API Gateway')
    .setDescription('Auth, OTP, and proxied endpoints for all downstream services')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(env.API_GATEWAY_PORT);
  app.get(Logger).log(`api-gateway running on :${env.API_GATEWAY_PORT}`);
  app.get(Logger).log(`Swagger docs at http://localhost:${env.API_GATEWAY_PORT}/api/docs`);
}

bootstrap();
