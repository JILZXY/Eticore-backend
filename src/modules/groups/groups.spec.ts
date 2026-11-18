import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../shared/audit/audit.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { GroupsService } from './groups.service.js';

describe('Groups & Reports services (unit)', () => {
  it('agregarIntegrante rechaza intervalo con salida <= ingreso antes de abrir transaccion', async () => {
    const createQueryRunnerMock = vi.fn();
    const auditMock = { registrar: vi.fn() } as unknown as AuditService;

    const service = new GroupsService(
      { createQueryRunner: createQueryRunnerMock } as unknown as DataSource,
      auditMock,
    );

    await expect(
      service.agregarIntegrante(1, 10, {
        usuario_id: 2,
        ingreso: '2026-11-10T10:00:00.000Z',
        salida: '2026-11-10T10:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      status: 400,
      codigo: 'INTERVALO_MEMBRESIA_INVALIDO',
    });

    expect(createQueryRunnerMock).not.toHaveBeenCalled();
  });

  it('agregarIntegrante bloquea fila grupo (FOR UPDATE) y rechaza solapamiento de intervalos', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: 10, activo: true }]) // SELECT grupo ... FOR UPDATE
      .mockResolvedValueOnce([{ id: 2 }]) // SELECT usuario
      .mockResolvedValueOnce([{ id: '99' }]); // SELECT solapamiento

    const rollbackMock = vi.fn().mockResolvedValue(undefined);
    const releaseMock = vi.fn().mockResolvedValue(undefined);

    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn(),
      rollbackTransaction: rollbackMock,
      release: releaseMock,
      manager: {},
    };

    const auditMock = { registrar: vi.fn() } as unknown as AuditService;
    const service = new GroupsService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      auditMock,
    );

    await expect(
      service.agregarIntegrante(1, 10, {
        usuario_id: 2,
        ingreso: '2026-11-10T12:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      status: 409,
      codigo: 'MEMBRESIA_SOLAPADA',
    });

    expect(queryMock.mock.calls[0]?.[0]).toContain('FOR UPDATE');
    expect(rollbackMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it('agregarIntegrante traduce violacion unica 23505 del indice parcial a 409 MEMBRESIA_SOLAPADA', async () => {
    const error23505 = Object.assign(new Error('duplicate key'), {
      code: '23505',
    });
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: 10, activo: true }])
      .mockResolvedValueOnce([{ id: 2 }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(error23505);

    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {},
    };

    const auditMock = { registrar: vi.fn() } as unknown as AuditService;
    const service = new GroupsService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      auditMock,
    );

    await expect(
      service.agregarIntegrante(1, 10, { usuario_id: 2 }),
    ).rejects.toMatchObject({
      status: 409,
      codigo: 'MEMBRESIA_SOLAPADA',
    });
  });

  it('retirarIntegrante cierra intervalo abierto y audita bajo bloqueo de grupo', async () => {
    const ingreso = new Date('2026-11-01T00:00:00.000Z');
    const salida = new Date('2026-11-15T00:00:00.000Z');
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: 10 }]) // FOR UPDATE grupo
      .mockResolvedValueOnce([{ id: '44', ingreso }]) // FOR UPDATE membresia abierta
      .mockResolvedValueOnce([]) // Sin solapamiento con otros intervalos
      .mockResolvedValueOnce([
        [{ id: '44', grupo_id: 10, usuario_id: 2, ingreso, salida }],
        1,
      ]);

    const registrarMock = vi.fn().mockResolvedValue(undefined);
    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {},
    };

    const service = new GroupsService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      { registrar: registrarMock } as unknown as AuditService,
    );

    const res = await service.retirarIntegrante(1, 10, 2, {
      salida: salida.toISOString(),
    });

    expect(res).toEqual({
      id: 44,
      grupo_id: 10,
      usuario_id: 2,
      ingreso,
      salida,
    });
    expect(registrarMock).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('obtenerReporteGrupo valida [desde, hasta) y suprime promedios < 5 mientras muestra >= 5 y No aplica', async () => {
    const queryMock = vi.fn().mockResolvedValueOnce([
      {
        unidad_id: 1,
        version_id: '101',
        version_numero: 1,
        version_titulo: 'Norma V1 (<5)',
        tipo_unidad: 'normamatch',
        participantes: 4,
        total_intentos_finalizados: 6,
        participantes_con_dominio: 3,
        promedio_puntuacion: null,
        celda_suprimida: true,
      },
      {
        unidad_id: 1,
        version_id: '102',
        version_numero: 2,
        version_titulo: 'Norma V2 (>=5)',
        tipo_unidad: 'normamatch',
        participantes: 5,
        total_intentos_finalizados: 7,
        participantes_con_dominio: 4,
        promedio_puntuacion: '86.00',
        celda_suprimida: false,
      },
      {
        unidad_id: 2,
        version_id: '201',
        version_numero: 1,
        version_titulo: 'Leccion Aprende',
        tipo_unidad: 'aprende',
        participantes: 2,
        total_intentos_finalizados: 2,
        participantes_con_dominio: 0,
        promedio_puntuacion: null,
        celda_suprimida: false,
      },
    ]);

    const groupsServiceMock = {
      obtenerGrupoPorId: vi.fn().mockResolvedValue({
        id: 5,
        nombre: 'Grupo 7A',
        periodo: '2026-2',
        activo: true,
        creado_en: new Date('2026-11-01T00:00:00.000Z'),
      }),
    } as unknown as GroupsService;

    const reportsService = new ReportsService(
      { query: queryMock } as unknown as DataSource,
      groupsServiceMock,
    );

    await expect(
      reportsService.obtenerReporteGrupo(5, {
        desde: '2026-11-10T00:00:00.000Z',
        hasta: '2026-11-10T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      status: 400,
      codigo: 'PERIODO_REPORTE_INVALIDO',
    });

    const reporte = await reportsService.obtenerReporteGrupo(5, {
      desde: '2026-11-01T00:00:00.000Z',
      hasta: '2026-11-20T00:00:00.000Z',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const sql = queryMock.mock.calls[0]?.[0] as string;
    expect(sql).toContain('elegibles AS');
    expect(sql).toContain('mejores AS');
    expect(sql).toContain('promedios AS');
    expect(sql).toContain('conteos AS');
    expect(sql).toContain('EXISTS');

    expect(reporte.celdas).toEqual([
      {
        unidad_id: 1,
        version_id: 101,
        version_numero: 1,
        titulo: 'Norma V1 (<5)',
        tipo: 'normamatch',
        participantes: 4,
        total_intentos_finalizados: 6,
        participantes_con_dominio: null,
        promedio: null,
        celda_suprimida: true,
      },
      {
        unidad_id: 1,
        version_id: 102,
        version_numero: 2,
        titulo: 'Norma V2 (>=5)',
        tipo: 'normamatch',
        participantes: 5,
        total_intentos_finalizados: 7,
        participantes_con_dominio: 4,
        promedio: 86,
        celda_suprimida: false,
      },
      {
        unidad_id: 2,
        version_id: 201,
        version_numero: 1,
        titulo: 'Leccion Aprende',
        tipo: 'aprende',
        participantes: 2,
        total_intentos_finalizados: 2,
        participantes_con_dominio: null,
        promedio: 'No aplica',
        celda_suprimida: false,
      },
    ]);
  });
});
