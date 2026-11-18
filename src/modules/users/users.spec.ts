import { HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../../shared/audit/audit.service.js';
import { UsersService } from './users.service.js';

describe('UsersService (unit)', () => {
  it('rechaza modificacion de correo en autoservicio con 400 CORREO_NO_EDITABLE', async () => {
    const dataSource = {
      query: vi.fn(),
      createQueryRunner: vi.fn(),
    } as unknown as DataSource;
    const auditService = {
      registrar: vi.fn(),
    } as unknown as AuditService;

    const service = new UsersService(dataSource, auditService);

    await expect(
      service.actualizarPerfilPropio(
        1,
        { nombre_visualizacion: 'Nuevo Nombre' },
        { nombre_visualizacion: 'Nuevo Nombre', correo: 'otro@eticore.edu.mx' },
      ),
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      codigo: 'CORREO_NO_EDITABLE',
    });
  });

  it('actualiza nombre_visualizacion y registra auditoria en la misma transaccion', async () => {
    const queryRunner = {
      connect: vi.fn().mockResolvedValue(undefined),
      startTransaction: vi.fn().mockResolvedValue(undefined),
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 5,
              nombre_visualizacion: 'Nombre Editado',
              correo_normalizado: 'aprendiz@eticore.edu.mx',
              activo: true,
              ruta_preferida_id: null,
              creado_en: new Date('2026-11-18T00:00:00.000Z'),
            },
          ],
          1,
        ])
        .mockResolvedValueOnce([{ codigo: 'APRENDIZ' }]),
      commitTransaction: vi.fn().mockResolvedValue(undefined),
      rollbackTransaction: vi.fn(),
      release: vi.fn().mockResolvedValue(undefined),
      manager: {},
    };

    const dataSource = {
      createQueryRunner: vi.fn().mockReturnValue(queryRunner),
    } as unknown as DataSource;

    const registrarMock = vi.fn().mockResolvedValue(undefined);
    const auditService = {
      registrar: registrarMock,
    } as unknown as AuditService;

    const service = new UsersService(dataSource, auditService);
    const perfil = await service.actualizarPerfilPropio(5, {
      nombre_visualizacion: 'Nombre Editado',
    });

    expect(perfil.nombre_visualizacion).toBe('Nombre Editado');
    expect(perfil.correo_normalizado).toBe('aprendiz@eticore.edu.mx');
    expect(perfil.roles).toEqual(['APRENDIZ']);
    expect(registrarMock).toHaveBeenCalledWith(
      queryRunner.manager,
      expect.objectContaining({
        actorId: 5,
        accion: 'actualizar_perfil_propio',
        resultado: 'exitoso',
      }),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
