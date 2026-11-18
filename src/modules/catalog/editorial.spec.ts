import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { calcularHuellaEditorial } from '../../common/utils/huella-editorial.js';
import type { AuditService } from '../../shared/audit/audit.service.js';
import { ContentValidatorService } from '../../shared/validation/content-validator.service.js';
import { EditorialDraftService } from './editorial-draft.service.js';
import { EditorialPublishService } from './editorial-publish.service.js';

describe('Editorial services (unit)', () => {
  it('calcularHuellaEditorial es invariante al orden de claves JSONB y sensible a cambios', () => {
    const baseA = calcularHuellaEditorial({
      unidad_id: 1,
      numero: 4,
      titulo: 'Norma V4',
      descripcion: 'Descripcion V4',
      tema_id: 2,
      dificultad: 'intermedio',
      esquema_version: 1,
      contenido: {
        situaciones: [
          {
            id: 's1',
            enunciado: 'Caso',
            opciones: [{ id: 'a', texto: 'Op A' }],
            respuesta_correcta: 'a',
            explicacion: 'Por normativa',
          },
        ],
      },
      referencias: [
        { clave_local: 'REF2', fuente_version_id: 12, revisada_en: '2026-11-01' },
        { clave_local: 'REF1', fuente_version_id: 11, revisada_en: '2026-10-15' },
      ],
    });

    const baseB = calcularHuellaEditorial({
      unidad_id: 1,
      numero: 4,
      titulo: 'Norma V4',
      descripcion: 'Descripcion V4',
      tema_id: 2,
      dificultad: 'intermedio',
      esquema_version: 1,
      contenido: {
        situaciones: [
          {
            explicacion: 'Por normativa',
            respuesta_correcta: 'a',
            opciones: [{ texto: 'Op A', id: 'a' }],
            enunciado: 'Caso',
            id: 's1',
          },
        ],
      },
      referencias: [
        { clave_local: 'REF1', fuente_version_id: 11, revisada_en: '2026-10-15' },
        { clave_local: 'REF2', fuente_version_id: 12, revisada_en: '2026-11-01' },
      ],
    });

    expect(baseA).toBe(baseB);
    expect(baseA).toMatch(/^[0-9a-f]{64}$/);

    const cambiada = calcularHuellaEditorial({
      unidad_id: 1,
      numero: 4,
      titulo: 'Norma V4 editada',
      descripcion: 'Descripcion V4',
      tema_id: 2,
      dificultad: 'intermedio',
      esquema_version: 1,
      contenido: {
        situaciones: [
          {
            id: 's1',
            enunciado: 'Caso',
            opciones: [{ id: 'a', texto: 'Op A' }],
            respuesta_correcta: 'a',
            explicacion: 'Por normativa',
          },
        ],
      },
      referencias: [
        { clave_local: 'REF1', fuente_version_id: 11, revisada_en: '2026-10-15' },
        { clave_local: 'REF2', fuente_version_id: 12, revisada_en: '2026-11-01' },
      ],
    });

    expect(cambiada).not.toBe(baseA);
  });

  it('actualizarVersionBorrador rechaza edicion de version publicada y conflicto de revision', async () => {
    const queryMockPublicada = vi.fn().mockResolvedValueOnce([
      {
        id: '10',
        unidad_id: 1,
        numero: 3,
        titulo: 'V3',
        descripcion: 'Desc',
        tema_id: 1,
        dificultad: 'basico',
        estado: 'publicado',
        esquema_version: 1,
        contenido: {},
        revision: 2,
        creada_en: new Date(),
        publicada_en: new Date(),
      },
    ]);

    const crearQr = (qMock: ReturnType<typeof vi.fn>) => ({
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: qMock,
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: { query: qMock },
    });

    const draftServicePub = new EditorialDraftService(
      {
        createQueryRunner: vi
          .fn()
          .mockReturnValue(crearQr(queryMockPublicada)),
      } as unknown as DataSource,
      new ContentValidatorService(),
      { registrar: vi.fn() } as unknown as AuditService,
    );

    await expect(
      draftServicePub.actualizarVersionBorrador(1, 10, { titulo: 'Otro' }),
    ).rejects.toMatchObject({
      status: 409,
      codigo: 'VERSION_PUBLICADA_INMUTABLE',
    });

    const queryMockRevision = vi.fn().mockResolvedValueOnce([
      {
        id: '11',
        unidad_id: 1,
        numero: 4,
        titulo: 'V4',
        descripcion: 'Desc',
        tema_id: 1,
        dificultad: 'basico',
        estado: 'borrador',
        esquema_version: 1,
        contenido: {},
        revision: 3,
        creada_en: new Date(),
        publicada_en: null,
      },
    ]);

    const draftServiceRev = new EditorialDraftService(
      {
        createQueryRunner: vi.fn().mockReturnValue(crearQr(queryMockRevision)),
      } as unknown as DataSource,
      new ContentValidatorService(),
      { registrar: vi.fn() } as unknown as AuditService,
    );

    await expect(
      draftServiceRev.actualizarVersionBorrador(1, 11, {
        revision_esperada: 2,
        titulo: 'Nuevo',
      }),
    ).rejects.toMatchObject({
      status: 409,
      codigo: 'REVISION_DESACTUALIZADA',
    });
  });

  it('publicarVersion rechaza con 422 sin revision aprobada o con huella desactualizada', async () => {
    const contenidoValido = {
      objetivo: 'Objetivo de prueba',
      secciones: [{ id: 's1', orden: 1, titulo: 'S1', cuerpo: 'Texto' }],
      ejemplo: 'Ejemplo claro',
    };

    const crearQr = (qMock: ReturnType<typeof vi.fn>) => ({
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: qMock,
      commitTransaction: vi.fn(),
      rollbackTransaction: vi.fn().mockResolvedValue(undefined),
      release: vi.fn().mockResolvedValue(undefined),
      manager: { query: qMock },
    });

    const filaVersion = {
      id: '12',
      unidad_id: 1,
      numero: 4,
      titulo: 'Aprende V4',
      descripcion: 'Desc V4',
      tema_id: 1,
      dificultad: 'basico',
      estado: 'borrador',
      esquema_version: 1,
      contenido: contenidoValido,
      revision: 1,
      creada_en: new Date(),
      publicada_en: null,
    };

    const filaUnidad = {
      id: 1,
      tipo: 'aprende',
      activa: true,
      muestra_publica: false,
      version_publicada_id: '11',
    };

    // Caso 1: sin revision aprobada
    const qSinRevision = vi
      .fn()
      .mockResolvedValueOnce([filaVersion])
      .mockResolvedValueOnce([filaUnidad])
      .mockResolvedValueOnce([]) // unidad_fuente
      .mockResolvedValueOnce([]); // revision_editorial

    const pubSinRev = new EditorialPublishService(
      {
        createQueryRunner: vi.fn().mockReturnValue(crearQr(qSinRevision)),
      } as unknown as DataSource,
      new ContentValidatorService(),
      { registrar: vi.fn() } as unknown as AuditService,
    );

    await expect(pubSinRev.publicarVersion(1, 12)).rejects.toMatchObject({
      status: 422,
      codigo: 'REVISION_APROBADA_REQUERIDA',
    });

    // Caso 2: huella desactualizada
    const qHuellaVieja = vi
      .fn()
      .mockResolvedValueOnce([filaVersion])
      .mockResolvedValueOnce([filaUnidad])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: '50',
          revisor_id: 1,
          huella_revisada: '0'.repeat(64),
          fecha: new Date(),
          resultado: 'aprobada',
        },
      ]);

    const pubHuellaVieja = new EditorialPublishService(
      {
        createQueryRunner: vi.fn().mockReturnValue(crearQr(qHuellaVieja)),
      } as unknown as DataSource,
      new ContentValidatorService(),
      { registrar: vi.fn() } as unknown as AuditService,
    );

    await expect(pubHuellaVieja.publicarVersion(1, 12)).rejects.toMatchObject({
      status: 422,
      codigo: 'HUELLA_EDITORIAL_DESACTUALIZADA',
    });
  });
});
