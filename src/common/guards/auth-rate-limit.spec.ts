import { type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfiguration } from '../../config/configuration.js';
import { RequestLoggingInterceptor } from '../interceptors/request-logging.interceptor.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';

function crearContextoHttpMock(params: {
  ip?: string;
  path?: string;
  body?: Record<string, unknown>;
  userId?: number;
  statusCode?: number;
}): {
  ctx: ExecutionContext;
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  const request = {
    ip: params.ip ?? '127.0.0.1',
    method: 'POST',
    path: params.path ?? '/api/v1/auth/login',
    originalUrl: `${params.path ?? '/api/v1/auth/login'}?debug=secret_query`,
    body: params.body ?? {},
    cookies: { eticore_sid: 'cookie-secreta-abc' },
    headers: { authorization: 'Bearer super-secreto' },
    user: params.userId !== undefined ? { id: params.userId } : undefined,
    socket: { remoteAddress: params.ip ?? '127.0.0.1' },
  };
  const response = {
    statusCode: params.statusCode ?? 200,
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
  };

  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { ctx, headers };
}

describe('AuthRateLimitGuard y RequestLoggingInterceptor (unit)', () => {
  it('bloquea con 429 LIMITE_PETICIONES_AUTH al superar umbral por IP+cuenta y aisla cuentas distintas', () => {
    const configMock = {
      get: vi.fn((clave: keyof AppConfiguration) => {
        if (clave === 'security') {
          return {
            authRateLimitTtlSeconds: 60,
            authRateLimitMaxAttempts: 3,
          };
        }
        return undefined;
      }),
    } as unknown as ConfigService<AppConfiguration, true>;

    const guard = new AuthRateLimitGuard(configMock);

    const { ctx: ctxCuenta1, headers: headers1 } = crearContextoHttpMock({
      body: { correo: 'Uno@Eticore.EDU.mx', contrasena: 'clave de prueba' },
    });

    expect(guard.canActivate(ctxCuenta1)).toBe(true);
    expect(guard.canActivate(ctxCuenta1)).toBe(true);
    expect(guard.canActivate(ctxCuenta1)).toBe(true);

    expect(() => guard.canActivate(ctxCuenta1)).toThrow(
      expect.objectContaining({
        status: 429,
        codigo: 'LIMITE_PETICIONES_AUTH',
      }),
    );
    expect(Number(headers1['Retry-After'])).toBeGreaterThanOrEqual(1);

    // Otra cuenta desde la misma IP mantiene su propia ventana
    const { ctx: ctxCuenta2 } = crearContextoHttpMock({
      body: { correo: 'dos@eticore.edu.mx' },
    });
    expect(guard.canActivate(ctxCuenta2)).toBe(true);
  });

  it('RequestLoggingInterceptor registra JSON estructurado sin cuerpo ni secretos ni query strings', async () => {
    const lineas: string[] = [];
    const interceptor = new RequestLoggingInterceptor((linea) => {
      lineas.push(linea);
    });

    const { ctx } = crearContextoHttpMock({
      path: '/api/v1/auth/login',
      body: {
        correo: 'aprendiz@eticore.edu.mx',
        contrasena: 'super-secret-password-2026',
        codigo: '123456',
      },
      statusCode: 200,
    });

    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ ok: true }) }));

    expect(lineas).toHaveLength(1);
    const parsed = JSON.parse(lineas[0] ?? '{}') as Record<string, unknown>;
    expect(parsed.event).toBe('http_request');
    expect(parsed.method).toBe('POST');
    expect(parsed.path).toBe('/api/v1/auth/login');
    expect(parsed.statusCode).toBe(200);
    expect(typeof parsed.durationMs).toBe('number');

    expect(lineas[0]).not.toContain('super-secret-password-2026');
    expect(lineas[0]).not.toContain('cookie-secreta-abc');
    expect(lineas[0]).not.toContain('super-secreto');
    expect(lineas[0]).not.toContain('secret_query');
    expect(lineas[0]).not.toContain('123456');
  });
});
