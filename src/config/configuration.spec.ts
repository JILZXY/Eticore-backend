import { describe, expect, it } from 'vitest';
import { validateEnv } from './configuration.js';
import { buildPostgresDataSourceOptions } from './database.config.js';

describe('Configuración de entorno y base de datos', () => {
  const sampleEnv = {
    NODE_ENV: 'test',
    PORT: '3000',
    DATABASE_URL: 'postgres://user_placeholder:pass_placeholder@db:5432/eticore',
    DB_POOL_MAX: '10',
    DB_SSL: 'false',
    TOTP_ENCRYPTION_KEY: 'a'.repeat(64),
    SESSION_COOKIE_NAME: 'eticore_sid',
    SESSION_COOKIE_SECURE: 'false',
    SESSION_IDLE_TIMEOUT_MINUTES: '30',
    SESSION_ABSOLUTE_TIMEOUT_HOURS: '8',
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('valida un entorno completo correctamente', () => {
    const validated = validateEnv(sampleEnv);
    expect(validated.PORT).toBe(3000);
    expect(validated.DB_SSL).toBe(false);
    expect(validated.SESSION_COOKIE_SECURE).toBe(false);
  });

  it('usa SESSION_COOKIE_SECURE=true por defecto si no se especifica', () => {
    const sinCookieSecure = { ...sampleEnv };
    delete (sinCookieSecure as Partial<typeof sampleEnv>).SESSION_COOKIE_SECURE;
    const validated = validateEnv(sinCookieSecure);
    expect(validated.SESSION_COOKIE_SECURE).toBe(true);
  });

  it('rechaza cuando falta DATABASE_URL o TOTP_ENCRYPTION_KEY es inválida', () => {
    expect(() =>
      validateEnv({
        ...sampleEnv,
        TOTP_ENCRYPTION_KEY: 'invalida',
      }),
    ).toThrow(/TOTP_ENCRYPTION_KEY/);

    const withoutDb = { ...sampleEnv };
    delete (withoutDb as Partial<typeof sampleEnv>).DATABASE_URL;
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/);
  });

  it('mantiene synchronize en false siempre', () => {
    const options = buildPostgresDataSourceOptions({
      url: sampleEnv.DATABASE_URL,
      poolMax: 10,
      ssl: false,
    });
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.entities).toHaveLength(31);
  });
});
