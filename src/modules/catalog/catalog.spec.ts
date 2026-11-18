import { HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { codificarCursorId } from '../../common/utils/paginacion-cursor.js';
import { ContentValidatorService } from '../../shared/validation/content-validator.service.js';
import { CatalogService } from './catalog.service.js';

describe('CatalogService (unit)', () => {
  it('rechaza filtro avance cuando es visitante sin sesion', async () => {
    const dataSource = { query: vi.fn() } as unknown as DataSource;
    const service = new CatalogService(
      dataSource,
      new ContentValidatorService(),
    );

    await expect(
      service.listarCatalogo({ avance: 'pendiente' }, undefined),
    ).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      codigo: 'SESION_INVALIDA',
    });
  });

  it('pagina por cursor y no selecciona contenido completo al listar', async () => {
    const queryMock = vi.fn().mockResolvedValue([
      {
        id: 1,
        tipo: 'aprende',
        muestra_publica: true,
        version_id: '10',
        version_numero: 1,
        titulo: 'Unidad 1',
        descripcion: 'Descripción 1',
        dificultad: 'basico',
        publicada_en: new Date(),
        tema_id: 1,
        tema_nombre: 'Privacidad',
      },
      {
        id: 2,
        tipo: 'normamatch',
        muestra_publica: false,
        version_id: '11',
        version_numero: 1,
        titulo: 'Unidad 2',
        descripcion: 'Descripción 2',
        dificultad: 'intermedio',
        publicada_en: new Date(),
        tema_id: 1,
        tema_nombre: 'Privacidad',
      },
    ]);

    const dataSource = { query: queryMock } as unknown as DataSource;
    const service = new CatalogService(
      dataSource,
      new ContentValidatorService(),
    );

    const resultado = await service.listarCatalogo({ limit: 1 });
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0].id).toBe(1);
    expect(resultado.siguiente_cursor).toBe(codificarCursorId(1));

    const sqlEjecutado = queryMock.mock.calls[0][0] as string;
    expect(sqlEjecutado).not.toContain('vu.contenido');
  });

  it('devuelve 404 si la unidad o muestra publica no esta disponible', async () => {
    const queryMock = vi.fn().mockResolvedValue([]);
    const dataSource = { query: queryMock } as unknown as DataSource;
    const service = new CatalogService(
      dataSource,
      new ContentValidatorService(),
    );

    await expect(service.obtenerMuestraPublica(999)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      codigo: 'UNIDAD_NO_ENCONTRADA',
    });
  });
});
