import { Module } from '@nestjs/common';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [TenantsModule, UsersModule, HealthModule] })
export class AppModule {}
