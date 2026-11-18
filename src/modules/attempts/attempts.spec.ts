import { HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../shared/audit/audit.service.js';
import { ContentValidatorService } from '../../shared/validation/content-validator.service.js';
import { ScoringService } from '../../shared/validation/scoring.service.js';
import type { GamificationService } from '../gamification/gamification.service.js';
import { AttemptsFinalizationService } from './attempts-finalization.service.js';
import { AttemptsStepService } from './attempts-step.service.js';
import { AttemptsService } from './attempts.service.js';

describe('Attempts services (unit)', () => {
  it('crearIntento devuelve el mismo intento si el UUID ya existe para el usuario y unidad', async () => {
    const existente = {
      id: '11111111-1111-4111-8111-111111111111',
      usuario_id: 5,
      unidad_id: 3,
      version_id: '12',
      version_numero: 1,
      tipo: 'aprende' as const,
      titulo: 'Lección 1',
      numero: 1,
      estado: 'en_curso' as const,
      inicio: new Date(),
      finalizacion: null,
      puntuacion: null,
      revision: 1,
      esquema_version: 1,
      recorrido: { secciones_visitadas: [], confirmado: false },
      contenido: {
        objetivo: 'Obj',
        secciones: [{ id: 's1', orden: 1, titulo: 'S1', cuerpo: 'C1' }],
        ejemplo: 'Ej',
      },
    };

    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ id: 5 }])
        .mockResolvedValueOnce([existente]),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {},
    };

    const dataSource = {
      createQueryRunner: vi.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    const service = new AttemptsService(
      dataSource,
      new ContentValidatorService(),
      new ScoringService(),
      { registrar: vi.fn() } as unknown as AuditService,
    );

    const res = await service.crearIntento(5, {
      id: existente.id,
      unidad_id: 3,
    });

    expect(res.id).toBe(existente.id);
    expect(res.numero).toBe(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('guardarPaso devuelve 409 REVISION_DESACTUALIZADA cuando la revision no coincide', async () => {
    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValueOnce([
        {
          id: '11111111-1111-4111-8111-111111111111',
          unidad_id: 3,
          version_id: '12',
          estado: 'en_curso',
          revision: 3,
          recorrido: { secciones_visitadas: ['s1'], confirmado: false },
          tipo: 'aprende',
          contenido: {
            objetivo: 'Obj',
            secciones: [{ id: 's1', orden: 1, titulo: 'S1', cuerpo: 'C1' }],
            ejemplo: 'Ej',
          },
        },
      ]),
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {},
    };

    const dataSource = {
      createQueryRunner: vi.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    const stepService = new AttemptsStepService(
      dataSource,
      new ScoringService(),
      { registrar: vi.fn() } as unknown as AuditService,
    );

    await expect(
      stepService.guardarPaso(5, '11111111-1111-4111-8111-111111111111', {
        revision: 2,
        seccion_id: 's1',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      codigo: 'REVISION_DESACTUALIZADA',
    });
  });

  it('finalizarIntento rechaza puntuacion enviada por el cliente', async () => {
    const service = new AttemptsFinalizationService(
      {} as DataSource,
      new ScoringService(),
      {} as GamificationService,
      {} as AuditService,
    );

    await expect(
      service.finalizarIntento(
        5,
        '11111111-1111-4111-8111-111111111111',
        {},
        { puntuacion: 100 },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      codigo: 'PUNTUACION_CLIENTE_PROHIBIDA',
    });
  });
});
