import { randomUUID } from 'crypto';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { ClaimsModule } from './claims/claims.module';
import { WorkflowModule } from './workflow/workflow.module';
import { FraudModule } from './fraud/fraud.module';
import { HealthModule } from './health/health.module';
import { KafkaModule } from './kafka/kafka.module';
import { EventsModule } from './events/events.module';

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
        base: { service: 'claims-service', env: process.env.NODE_ENV ?? 'development' },
        genReqId: (req) => (req.headers['x-correlation-id'] as string) ?? randomUUID(),
        redact: {
          paths: ['req.headers["x-internal-service-secret"]'],
          remove: true,
        },
      },
    }),
    KafkaModule,
    EventsModule,
    ClaimsModule,
    WorkflowModule,
    FraudModule,
    HealthModule,
  ],
})
export class AppModule {}
