import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../shared/audit/audit.service.js';
import { LegalService } from '../legal/legal.service.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminRolesService } from './admin-roles.service.js';

describe('Admin & Legal services (unit)', () => {
  it('desactivarCuenta bloquea guarda_integridad FOR UPDATE antes de contar y rechaza ultimo ADMIN_TECNICO activo', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ clave: 'admin_tecnico_activo' }])
      .mockResolvedValueOnce([
        {
          id: 1,
          nombre_visualizacion: 'Tech 1',
          correo_normalizado: 'tech1@eticore.edu.mx',
          activo: true,
          ruta_preferida_id: null,
          creado_en: new Date(),
        },
      ])
      .mockResolvedValueOnce([{ codigo: 'APRENDIZ' }, { codigo: 'ADMIN_TECNICO' }])
      .mockResolvedValueOnce([{ total: 0 }]);

    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: { query: queryMock },
    };

    const service = new AdminAccountsService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      { registrar: vi.fn() } as unknown as AuditService,
    );

    await expect(service.desactivarCuenta(1, 1)).rejects.toMatchObject({
      status: 409,
      codigo: 'ULTIMO_ADMIN_TECNICO_ACTIVO',
    });

    expect(queryMock.mock.calls[0]?.[0]).toContain('guarda_integridad');
    expect(queryMock.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('desactivarCuenta revoca sesiones y audita en la misma transaccion cuando quedan otros tecnicos', async () => {
    const ahora = new Date();
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ clave: 'admin_tecnico_activo' }])
      .mockResolvedValueOnce([
        {
          id: 2,
          nombre_visualizacion: 'Tech 2',
          correo_normalizado: 'tech2@eticore.edu.mx',
          activo: true,
          ruta_preferida_id: null,
          creado_en: ahora,
        },
      ])
      .mockResolvedValueOnce([{ codigo: 'APRENDIZ' }, { codigo: 'ADMIN_TECNICO' }])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        [
          {
            id: 2,
            nombre_visualizacion: 'Tech 2',
            correo_normalizado: 'tech2@eticore.edu.mx',
            activo: false,
            ruta_preferida_id: null,
            creado_en: ahora,
          },
        ],
        1,
      ])
      .mockResolvedValueOnce([[{ usuario_id: 2 }, { usuario_id: 2 }], 2]);

    const registrarMock = vi.fn().mockResolvedValue(undefined);
    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      manager: { query: queryMock },
    };

    const service = new AdminAccountsService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      { registrar: registrarMock } as unknown as AuditService,
    );

    const res = await service.desactivarCuenta(1, 2);
    expect(res.activo).toBe(false);
    expect(res.sesiones_revocadas).toBe(2);
    expect(registrarMock).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('retirarRol bloquea guarda_integridad FOR UPDATE y protege al ultimo ADMIN_TECNICO activo', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ clave: 'admin_tecnico_activo' }])
      .mockResolvedValueOnce([{ id: 1, activo: true }])
      .mockResolvedValueOnce([{ id: 3, codigo: 'ADMIN_TECNICO' }])
      .mockResolvedValueOnce([{ usuario_id: 1 }])
      .mockResolvedValueOnce([{ total: 0 }]);

    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: { query: queryMock },
    };

    const service = new AdminRolesService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      { registrar: vi.fn() } as unknown as AuditService,
    );

    await expect(
      service.retirarRol(1, { usuario_id: 1, rol_codigo: 'ADMIN_TECNICO' }),
    ).rejects.toMatchObject({
      status: 409,
      codigo: 'ULTIMO_ADMIN_TECNICO_ACTIVO',
    });

    expect(queryMock.mock.calls[0]?.[0]).toContain('guarda_integridad');
    expect(queryMock.mock.calls[0]?.[0]).toContain('FOR UPDATE');
  });

  it('AdminAuditService consulta auditoria y auditoria_bd usando exclusivamente AUDIT_DATA_SOURCE', async () => {
    const auditQueryMock = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: '15',
          actor_id: 1,
          origen_actor: 'usuario',
          fecha_servidor: new Date(),
          accion: 'asignar_rol',
          recurso_tipo: 'usuario_rol',
          recurso_id: '2:ADMIN_CONTENIDO',
          resultado: 'exitoso',
          correlacion: null,
          detalle_minimo: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: '9',
          fecha_servidor: new Date(),
          usuario_bd: 'eticore_app',
          operacion: 'UPDATE',
          esquema: 'public',
          tabla: 'usuario',
          registro_id: '2',
          datos_anteriores: { activo: true },
          datos_nuevos: { activo: false },
          aplicacion: 'eticore-api',
          direccion_ip: '127.0.0.1',
        },
      ]);

    const service = new AdminAuditService({
      query: auditQueryMock,
    } as unknown as DataSource);

    const appRes = await service.listarAuditoria({ fuente: 'aplicacion' });
    expect(appRes.fuente).toBe('aplicacion');
    expect(appRes.items).toHaveLength(1);

    const bdRes = await service.listarAuditoria({ fuente: 'bd' });
    expect(bdRes.fuente).toBe('bd');
    expect(bdRes.items).toHaveLength(1);
    expect(auditQueryMock).toHaveBeenCalledTimes(2);
  });

  it('LegalService maneja idempotencia por clave_operacion y rechaza adjuntos de identificacion', async () => {
    const claveOp = '11111111-1111-4111-8111-111111111111';
    const filaExistente = {
      id: '88',
      usuario_id: 5,
      version_documento_id: '1',
      finalidad_codigo: 'analitica_educativa',
      tipo_evento: 'terminos_aceptados' as const,
      fecha_servidor: new Date(),
      canal: 'web',
      clave_operacion: claveOp,
    };

    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: '1' }])
      .mockResolvedValueOnce([]) // ON CONFLICT DO NOTHING -> ya existia
      .mockResolvedValueOnce([filaExistente]);

    const registrarMock = vi.fn();
    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      manager: { query: queryMock },
    };

    const legalService = new LegalService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      { registrar: registrarMock } as unknown as AuditService,
    );

    const evento = await legalService.registrarEventoLegal(5, {
      version_documento_id: 1,
      tipo_evento: 'terminos_aceptados',
      clave_operacion: claveOp,
    });

    expect(evento.id).toBe(88);
    expect(evento.idempotente).toBe(true);
    expect(registrarMock).not.toHaveBeenCalled();

    await expect(
      legalService.crearSolicitudPrivacidad(5, {
        tipo: 'acceso',
        verificacion_minima: 'data:image/png;base64,iVBORw0KGgo=',
      }),
    ).rejects.toMatchObject({
      status: 400,
      codigo: 'ADJUNTO_IDENTIFICACION_PROHIBIDO',
    });
  });
});
