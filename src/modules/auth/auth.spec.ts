import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator.js';
import { DomainError } from '../../common/errors/domain.error.js';
import { OwnershipGuard } from '../../common/guards/ownership.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import {
  calcularHashSesion,
  derivarArgon2id,
  generarCredencialSesion,
  validarPoliticaContrasena,
} from '../../common/utils/hashing.js';
import { normalizarCorreo } from '../../common/utils/normalizacion-correo.js';
import type { AppConfiguration } from '../../config/configuration.js';
import type { AuditService } from '../../shared/audit/audit.service.js';
import { AuthService } from './auth.service.js';
import type { TotpChallengeService } from './totp-challenge.service.js';

function crearConfigMock(): ConfigService<AppConfiguration, true> {
  return {
    get: vi.fn((clave: keyof AppConfiguration) => {
      if (clave === 'security') {
        return {
          totpEncryptionKeyHex: '0'.repeat(64),
          sessionCookieName: 'eticore_sid',
          sessionCookieSecure: true,
          sessionIdleTimeoutMinutes: 30,
          sessionAbsoluteTimeoutHours: 8,
          corsOrigin: 'http://localhost:5173',
        };
      }
      return undefined;
    }),
  } as unknown as ConfigService<AppConfiguration, true>;
}

describe('AuthService y Guards (unit)', () => {
  it('normaliza correo y valida politica de contrasena RN-19', () => {
    expect(normalizarCorreo('  Test.User@Eticore.EDU.mx  ')).toBe(
      'test.user@eticore.edu.mx',
    );

    expect(() =>
      validarPoliticaContrasena('corta123', 'test@eticore.edu.mx'),
    ).toThrow(DomainError);

    expect(() =>
      validarPoliticaContrasena('password1234567', 'test@eticore.edu.mx'),
    ).toThrow(DomainError);

    expect(() =>
      validarPoliticaContrasena(
        'clave segura test.user 2026',
        'test.user@eticore.edu.mx',
      ),
    ).toThrow(DomainError);

    expect(() =>
      validarPoliticaContrasena(
        'frase larga con espacios 2026',
        'otro@eticore.edu.mx',
      ),
    ).not.toThrow();
  });

  it('mapea colision de correo unico (23505) a 409 CORREO_YA_REGISTRADO', async () => {
    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ id: 1 }])
        .mockRejectedValueOnce({ code: '23505' }),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {},
    };

    const dataSource = {
      createQueryRunner: vi.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    const authDataSource = {
      query: vi.fn(),
    } as unknown as DataSource;

    const auditService = {
      registrar: vi.fn(),
      registrarFueraDeTransaccion: vi.fn(),
    } as unknown as AuditService;

    const service = new AuthService(
      dataSource,
      authDataSource,
      auditService,
      crearConfigMock(),
      {} as TotpChallengeService,
    );

    await expect(
      service.registrar({
        nombre_visualizacion: 'Aprendiz Uno',
        correo: '  Duplicado@Eticore.EDU.mx ',
        contrasena: 'frase de prueba suficientemente larga',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      codigo: 'CORREO_YA_REGISTRADO',
    });

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('usa authDataSource para leer credencial y rechaza con 401 generico cuando falla', async () => {
    const verificador = await derivarArgon2id('frase valida muy segura 2026');

    const dataSourceQueryMock = vi.fn();
    const dataSource = {
      query: dataSourceQueryMock,
      createQueryRunner: vi.fn(),
    } as unknown as DataSource;

    const authQueryMock = vi.fn().mockResolvedValue([
      {
        usuario_id: 7,
        nombre_visualizacion: 'Aprendiz',
        correo_normalizado: 'aprendiz@eticore.edu.mx',
        activo: true,
        ruta_preferida_id: null,
        creado_en: new Date(),
        verificador_argon2id: verificador,
        tiene_2fa_confirmado: false,
        exige_2fa_por_rol: false,
      },
    ]);
    const authDataSource = {
      query: authQueryMock,
    } as unknown as DataSource;

    const registrarFueraMock = vi.fn().mockResolvedValue(undefined);
    const auditService = {
      registrar: vi.fn(),
      registrarFueraDeTransaccion: registrarFueraMock,
    } as unknown as AuditService;

    const service = new AuthService(
      dataSource,
      authDataSource,
      auditService,
      crearConfigMock(),
      {} as TotpChallengeService,
    );

    await expect(
      service.login({
        correo: 'aprendiz@eticore.edu.mx',
        contrasena: 'otra frase totalmente distinta',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      codigo: 'CREDENCIALES_INVALIDAS',
    });

    expect(authQueryMock).toHaveBeenCalledTimes(1);
    expect(dataSourceQueryMock).not.toHaveBeenCalled();
    expect(registrarFueraMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accion: 'login_fallido',
        resultado: 'rechazado',
      }),
    );
  });

  it('SessionAuthGuard rechaza sesiones expiradas y sesiones admin sin verificado_2fa', async () => {
    const { valorCookie } = generarCredencialSesion();
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(false),
    } as unknown as Reflector;

    const queryMock = vi.fn();
    const dataSource = {
      query: queryMock,
    } as unknown as DataSource;

    const guard = new SessionAuthGuard(reflector, dataSource, crearConfigMock());

    const contexto = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { cookie: `eticore_sid=${valorCookie}` },
          cookies: { eticore_sid: valorCookie },
        }),
      }),
    } as never;

    const ahora = Date.now();
    queryMock.mockResolvedValueOnce([
      {
        usuario_id: 10,
        creada_en: new Date(ahora - 5 * 60_000),
        ultima_actividad: new Date(ahora - 31 * 60_000),
        expira_en: new Date(ahora + 7 * 3_600_000),
        revocada_en: null,
        verificado_2fa: false,
        activo: true,
        nombre_visualizacion: 'Prueba',
        correo_normalizado: 'prueba@eticore.edu.mx',
        ruta_preferida_id: null,
      },
    ]);

    await expect(guard.canActivate(contexto)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      codigo: 'SESION_EXPIRADA',
    });

    queryMock.mockResolvedValueOnce([
      {
        usuario_id: 10,
        creada_en: new Date(ahora - 9 * 3_600_000),
        ultima_actividad: new Date(ahora - 60_000),
        expira_en: new Date(ahora + 60_000),
        revocada_en: null,
        verificado_2fa: false,
        activo: true,
        nombre_visualizacion: 'Prueba',
        correo_normalizado: 'prueba@eticore.edu.mx',
        ruta_preferida_id: null,
      },
    ]);

    await expect(guard.canActivate(contexto)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      codigo: 'SESION_EXPIRADA',
    });

    // Sesión admin vigente pero con verificado_2fa = false -> 403 SEGUNDO_FACTOR_REQUERIDO
    queryMock
      .mockResolvedValueOnce([
        {
          usuario_id: 10,
          creada_en: new Date(ahora - 60_000),
          ultima_actividad: new Date(ahora - 30_000),
          expira_en: new Date(ahora + 7 * 3_600_000),
          revocada_en: null,
          verificado_2fa: false,
          activo: true,
          nombre_visualizacion: 'Admin',
          correo_normalizado: 'admin@eticore.edu.mx',
          ruta_preferida_id: null,
        },
      ])
      .mockResolvedValueOnce([[{ usuario_id: 10 }], 1])
      .mockResolvedValueOnce([{ codigo: 'ADMIN_TECNICO' }]);

    await expect(guard.canActivate(contexto)).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      codigo: 'SEGUNDO_FACTOR_REQUERIDO',
    });
  });

  it('RolesGuard y OwnershipGuard validan permisos por rol y propiedad', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['ADMIN_TECNICO']),
    } as unknown as Reflector;
    const rolesGuard = new RolesGuard(reflector);
    const ownershipGuard = new OwnershipGuard();

    const usuarioAprendiz: UsuarioAutenticado = {
      id: 42,
      nombreVisualizacion: 'Aprendiz',
      correoNormalizado: 'aprendiz@eticore.edu.mx',
      rutaPreferidaId: null,
      roles: ['APRENDIZ'],
      verificado2fa: false,
      hashSesion: calcularHashSesion('valor-cookie-ficticio'),
    };

    const ctxOtroUsuario = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: usuarioAprendiz,
          params: { usuarioId: '99' },
        }),
      }),
    } as never;

    expect(() => rolesGuard.canActivate(ctxOtroUsuario)).toThrow(DomainError);
    expect(() => ownershipGuard.canActivate(ctxOtroUsuario)).toThrow(
      DomainError,
    );

    const ctxPropio = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: usuarioAprendiz,
          params: { usuarioId: '42' },
        }),
      }),
    } as never;

    expect(ownershipGuard.canActivate(ctxPropio)).toBe(true);
  });
});
