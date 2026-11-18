import { z } from 'zod';

const booleanStringSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const postgresUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) =>
      value.startsWith('postgres://') || value.startsWith('postgresql://'),
    {
      message: 'Debe ser una URL de conexión PostgreSQL válida',
    },
  );

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ETICORE_API_DOMAIN: z.string().trim().min(1).optional(),
  DATABASE_URL: postgresUrlSchema,
  AUTH_DATABASE_URL: postgresUrlSchema.optional(),
  AUDIT_DATABASE_URL: postgresUrlSchema.optional(),
  MIGRATION_DATABASE_URL: postgresUrlSchema.optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_SSL: booleanStringSchema.default(false),
  TOTP_ENCRYPTION_KEY: z
    .string()
    .trim()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      'TOTP_ENCRYPTION_KEY debe ser hexadecimal de 64 caracteres (32 bytes)',
    ),
  SESSION_COOKIE_NAME: z.string().trim().min(1).default('eticore_sid'),
  SESSION_COOKIE_SECURE: booleanStringSchema.default(true),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(480).default(30),
  SESSION_ABSOLUTE_TIMEOUT_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  AUTH_RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(60),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(1000).default(20),
  CORS_ORIGIN: z.string().trim().min(1),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export interface AppConfiguration {
  nodeEnv: ValidatedEnv['NODE_ENV'];
  port: number;
  apiDomain?: string;
  database: {
    url: string;
    authUrl: string;
    auditUrl: string;
    migrationUrl: string;
    poolMax: number;
    ssl: boolean;
  };
  security: {
    totpEncryptionKeyHex: string;
    sessionCookieName: string;
    sessionCookieSecure: boolean;
    sessionIdleTimeoutMinutes: number;
    sessionAbsoluteTimeoutHours: number;
    authRateLimitTtlSeconds: number;
    authRateLimitMaxAttempts: number;
    corsOrigin: string;
  };
}

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const normalizedConfig: Record<string, unknown> = { ...config };

  if (normalizedConfig.AUTH_DATABASE_URL === '') {
    delete normalizedConfig.AUTH_DATABASE_URL;
  }
  if (normalizedConfig.AUDIT_DATABASE_URL === '') {
    delete normalizedConfig.AUDIT_DATABASE_URL;
  }
  if (normalizedConfig.MIGRATION_DATABASE_URL === '') {
    delete normalizedConfig.MIGRATION_DATABASE_URL;
  }

  const parsed = envSchema.safeParse(normalizedConfig);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Variables de entorno inválidas: ${details}`);
  }

  return parsed.data;
}

export function configuration(): AppConfiguration {
  const validated = validateEnv(process.env);

  return {
    nodeEnv: validated.NODE_ENV,
    port: validated.PORT,
    apiDomain: validated.ETICORE_API_DOMAIN,
    database: {
      url: validated.DATABASE_URL,
      authUrl: validated.AUTH_DATABASE_URL ?? validated.DATABASE_URL,
      auditUrl: validated.AUDIT_DATABASE_URL ?? validated.DATABASE_URL,
      migrationUrl: validated.MIGRATION_DATABASE_URL ?? validated.DATABASE_URL,
      poolMax: validated.DB_POOL_MAX,
      ssl: validated.DB_SSL,
    },
    security: {
      totpEncryptionKeyHex: validated.TOTP_ENCRYPTION_KEY,
      sessionCookieName: validated.SESSION_COOKIE_NAME,
      sessionCookieSecure: validated.SESSION_COOKIE_SECURE,
      sessionIdleTimeoutMinutes: validated.SESSION_IDLE_TIMEOUT_MINUTES,
      sessionAbsoluteTimeoutHours: validated.SESSION_ABSOLUTE_TIMEOUT_HOURS,
      authRateLimitTtlSeconds: validated.AUTH_RATE_LIMIT_TTL_SECONDS,
      authRateLimitMaxAttempts: validated.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
      corsOrigin: validated.CORS_ORIGIN,
    },
  };
}
