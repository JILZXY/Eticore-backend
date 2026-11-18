import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../shared/audit/audit.service.js';
import { RoutesProgressService } from './routes-progress.service.js';
import { RoutesService } from './routes.service.js';

describe('Routes services (unit)', () => {
  it('ruta vacia devuelve "Sin actividades" y porcentaje null (nunca 100 falso)', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ ruta_preferida_id: 1 }])
      .mockResolvedValueOnce([{ total_puntos: 20 }])
      .mockResolvedValueOnce([
        {
          inscripcion_id: '10',
          ruta_id: 1,
          ruta_nombre: 'Ruta Vacía',
          ruta_version_id: '5',
          version_numero: 1,
          inscrita_en: new Date(),
          migrada_de_id: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const service = new RoutesProgressService({
      query: queryMock,
    } as unknown as DataSource);

    const progreso = await service.obtenerProgreso(7);
    expect(progreso.estado).toBe('Sin actividades');
    expect(progreso.porcentaje).toBeNull();
    expect(progreso.total_obligatorias).toBe(0);
    expect(progreso.completadas_obligatorias).toBe(0);
    expect(progreso.creditos_totales_usuario).toBe(20);
  });

  it('calcula progreso solo sobre obligatorias de la version inscrita e incluye unidades desactivadas en denominador', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ ruta_preferida_id: 2 }])
      .mockResolvedValueOnce([{ total_puntos: 10 }])
      .mockResolvedValueOnce([
        {
          inscripcion_id: '20',
          ruta_id: 2,
          ruta_nombre: 'TI',
          ruta_version_id: '8',
          version_numero: 1,
          inscrita_en: new Date(),
          migrada_de_id: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          ruta_version_id: '8',
          unidad_id: 1,
          tipo: 'aprende',
          activa: false,
          orden: 1,
          obligatoria: true,
          puntos_acreditados: 10,
          completada_en: new Date(),
        },
        {
          ruta_version_id: '8',
          unidad_id: 2,
          tipo: 'normamatch',
          activa: false,
          orden: 2,
          obligatoria: true,
          puntos_acreditados: null,
          completada_en: null,
        },
        {
          ruta_version_id: '8',
          unidad_id: 3,
          tipo: 'aprende',
          activa: true,
          orden: 3,
          obligatoria: false,
          puntos_acreditados: 10,
          completada_en: new Date(),
        },
      ]);

    const service = new RoutesProgressService({
      query: queryMock,
    } as unknown as DataSource);

    const progreso = await service.obtenerProgreso(7);
    expect(progreso.estado).toBe('En progreso');
    expect(progreso.total_obligatorias).toBe(2);
    expect(progreso.completadas_obligatorias).toBe(1);
    expect(progreso.porcentaje).toBe(50);
  });

  it('cambiarRuta crea inscripcion sin migrar y sin tocar usuario_rol', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ id: 7 }])
      .mockResolvedValueOnce([
        { id: 3, nombre: 'TI', version_actual_id: '11', version_numero: 2 },
      ])
      .mockResolvedValueOnce([
        {
          id: '33',
          ruta_version_id: '11',
          inscrita_en: new Date(),
          migrada_de_id: null,
        },
      ])
      .mockResolvedValueOnce([[], 1]);

    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: queryMock,
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {},
    };

    const registrarMock = vi.fn().mockResolvedValue(undefined);
    const service = new RoutesService(
      {
        createQueryRunner: vi.fn().mockReturnValue(queryRunner),
      } as unknown as DataSource,
      { registrar: registrarMock } as unknown as AuditService,
    );

    const res = await service.cambiarRuta(7, { ruta_id: 3 });
    expect(res.ruta_id).toBe(3);
    expect(res.ruta_version_id).toBe(11);
    expect(res.migrada_de_id).toBeNull();
    expect(registrarMock).toHaveBeenCalledWith(
      queryRunner.manager,
      expect.objectContaining({
        accion: 'cambiar_ruta',
        recursoId: '3',
      }),
    );
  });
});
