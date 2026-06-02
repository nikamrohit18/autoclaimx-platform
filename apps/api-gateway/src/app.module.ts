import { randomUUID } from 'crypto';
import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';

@Module({
  imports: [
    PrometheusModule.register({ path: '/metrics', defaultMetrics: { enabled: true } }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        base: { service: 'api-gateway', env: process.env.NODE_ENV ?? 'development' },
        genReqId: (req) => (req.headers['x-correlation-id'] as string) ?? randomUUID(),
        redact: {
          paths: ['req.headers.authorization', 'req.headers["x-internal-service-secret"]'],
          remove: true,
        },
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    GatewayModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
