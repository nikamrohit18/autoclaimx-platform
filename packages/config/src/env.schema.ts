import { z } from 'zod';

// Shared env schema imported by all NestJS services.
// Each service extends this with service-specific vars.
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  INTERNAL_SERVICE_SECRET: z.string().min(16),
  AWS_REGION: z.string().default('ap-southeast-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
});

export const claimsServiceEnvSchema = baseEnvSchema.extend({
  CLAIMS_SERVICE_PORT: z.coerce.number().default(3001),
  S3_MEDIA_BUCKET: z.string(),
  S3_DOCS_BUCKET: z.string(),
  MONGODB_URI: z.string().url(),
  NEO4J_URI: z.string(),
  NEO4J_USER: z.string(),
  NEO4J_PASSWORD: z.string(),
  DAMAGE_DETECTION_URL: z.string().url(),
  FRAUD_ML_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export const workshopServiceEnvSchema = baseEnvSchema.extend({
  WORKSHOP_SERVICE_PORT: z.coerce.number().default(3002),
  S3_DOCS_BUCKET: z.string(),
  OCR_EXTRACTION_URL: z.string().url(),
  NEGOTIATION_LLM_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export const apiGatewayEnvSchema = baseEnvSchema.extend({
  API_GATEWAY_PORT: z.coerce.number().default(3000),
  CLAIMS_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  WORKSHOP_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  ADMIN_SERVICE_URL: z.string().url().default('http://localhost:3003'),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  COGNITO_REGION: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
});

export function validateEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
