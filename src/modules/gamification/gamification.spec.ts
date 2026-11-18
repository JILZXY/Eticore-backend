import { DataSource, type EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { GamificationService } from './gamification.service.js';

describe('GamificationService (unit)', () => {
  it('deriva rango correctamente con umbrales 100 y 300 desde credito_unidad', async () => {
    const queryMock = vi
      .fn()
      .mockResolvedValueOnce([{ puntos_totales: 50 }])
      .mockResolvedValueOnce([{ puntos_totales: 100 }])
      .mockResolvedValueOnce([{ puntos_totales: 320 }]);

    const service = new GamificationService({
      query: queryMock,
    } as unknown as DataSource);

    const r1 = await service.obtenerRango(1);
    expect(r1.rango).toBe('Inicial');
    expect(r1.siguiente_umbral).toBe(100);
    expect(r1.puntos_faltantes).toBe(50);

    const r2 = await service.obtenerRango(1);
    expect(r2.rango).toBe('Intermedio');
    expect(r2.siguiente_umbral).toBe(300);
    expect(r2.puntos_faltantes).toBe(200);

    const r3 = await service.obtenerRango(1);
    expect(r3.rango).toBe('Avanzado');
    expect(r3.siguiente_umbral).toBeNull();
    expect(r3.puntos_faltantes).toBe(0);
  });

  it('salta concesion de insignias cuando la tabla insignia esta vacia', async () => {
    const managerQueryMock = vi.fn().mockResolvedValueOnce([]);
    const manager = { query: managerQueryMock } as unknown as EntityManager;

    const service = new GamificationService({} as DataSource);
    const concedidas = await service.evaluarYConcederInsigniasEnTx(manager, {
      usuarioId: 1,
      intentoId: '11111111-1111-4111-8111-111111111111',
    });

    expect(concedidas).toEqual([]);
    expect(managerQueryMock).toHaveBeenCalledTimes(1);
  });
});
