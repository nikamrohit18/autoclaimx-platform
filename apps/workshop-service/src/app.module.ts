import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { KafkaModule } from './kafka/kafka.module';
import { WorkshopsModule } from './workshops/workshops.module';
import { EstimatesModule } from './estimates/estimates.module';
import { NegotiationModule } from './negotiation/negotiation.module';
import { HealthModule } from './health/health.module';

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
        base: { service: 'workshop-service', env: process.env.NODE_ENV ?? 'development' },
        genReqId: (req) => (req.headers['x-correlation-id'] as string) ?? randomUUID(),
        redact: {
          paths: ['req.headers["x-internal-service-secret"]'],
          remove: true,
        },
      },
    }),
    KafkaModule,
    WorkshopsModule,
    EstimatesModule,
    NegotiationModule,
    HealthModule,
  ],
})
export class AppModule {}
