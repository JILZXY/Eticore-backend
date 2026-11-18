import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { RolCodigo } from '../../common/decorators/roles.decorator.js';
import { DomainError } from '../../common/errors/domain.error.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { UsuarioPublico } from '../auth/auth.service.js';
import type { ActualizarPerfilDto } from './dto/actualizar-perfil.dto.js';

interface FilaUsuarioPerfil {
  id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  activo: boolean;
  ruta_preferida_id: number | null;
  creado_en: Date;
}

function esErrorFkPostgres(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const errObj = error as {
    code?: string;
    driverError?: { code?: string };
  };
  return errObj.code === '23503' || errObj.driverError?.code === '23503';
}

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async obtenerPerfilPropio(usuarioId: number): Promise<UsuarioPublico> {
    const filas = (await this.dataSource.query(
      `SELECT
         id,
         nombre_visualizacion,
         correo_normalizado,
         activo,
         ruta_preferida_id,
         creado_en
       FROM usuario
       WHERE id = $1
       LIMIT 1`,
      [usuarioId],
    )) as FilaUsuarioPerfil[];

    const usuario = filas[0];
    if (!usuario) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'USUARIO_NO_ENCONTRADO',
        'Usuario no encontrado',
      );
    }

    const filasRoles = (await this.dataSource.query(
      `SELECT r.codigo
       FROM usuario_rol ur
       INNER JOIN rol r ON r.id = ur.rol_id
       WHERE ur.usuario_id = $1
       ORDER BY r.id`,
      [usuarioId],
    )) as Array<{ codigo: RolCodigo }>;

    return {
      id: usuario.id,
      nombre_visualizacion: usuario.nombre_visualizacion,
      correo_normalizado: usuario.correo_normalizado,
      activo: usuario.activo,
      ruta_preferida_id: usuario.ruta_preferida_id,
      roles: filasRoles.map((r) => r.codigo),
      creado_en: usuario.creado_en,
    };
  }

  async actualizarPerfilPropio(
    usuarioId: number,
    dto: ActualizarPerfilDto,
    cuerpoCrudo?: Record<string, unknown>,
  ): Promise<UsuarioPublico> {
    if (
      cuerpoCrudo &&
      ('correo' in cuerpoCrudo || 'correo_normalizado' in cuerpoCrudo)
    ) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'CORREO_NO_EDITABLE',
        'El correo electrónico no es editable en autoservicio',
      );
    }

    const tieneNombre = dto.nombre_visualizacion !== undefined;
    const tieneRuta = dto.ruta_preferida_id !== undefined;

    if (!tieneNombre && !tieneRuta) {
      return this.obtenerPerfilPropio(usuarioId);
    }

    const asignaciones: string[] = [];
    const valores: unknown[] = [];
    let indice = 1;

    if (tieneNombre) {
      const nombreLimpio = dto.nombre_visualizacion!.trim();
      if (nombreLimpio.length < 2 || nombreLimpio.length > 80) {
        throw new DomainError(
          HttpStatus.BAD_REQUEST,
          'NOMBRE_INVALIDO',
          'El nombre de visualización debe tener entre 2 y 80 caracteres',
        );
      }
      asignaciones.push(`nombre_visualizacion = $${indice++}`);
      valores.push(nombreLimpio);
    }

    if (tieneRuta) {
      asignaciones.push(`ruta_preferida_id = $${indice++}`);
      valores.push(dto.ruta_preferida_id ?? null);
    }

    valores.push(usuarioId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const resultadoUpdate = (await queryRunner.query(
        `UPDATE usuario
         SET ${asignaciones.join(', ')}
         WHERE id = $${indice}
         RETURNING id, nombre_visualizacion, correo_normalizado, activo, ruta_preferida_id, creado_en`,
        valores,
      )) as unknown;

      const actualizados = extraerFilasMutacion<FilaUsuarioPerfil>(
        resultadoUpdate,
      );

      const actualizado = actualizados[0];
      if (!actualizado) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'USUARIO_NO_ENCONTRADO',
          'Usuario no encontrado',
        );
      }

      const filasRoles = (await queryRunner.query(
        `SELECT r.codigo
         FROM usuario_rol ur
         INNER JOIN rol r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1
         ORDER BY r.id`,
        [usuarioId],
      )) as Array<{ codigo: RolCodigo }>;

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuarioId,
        origenActor: 'usuario',
        accion: 'actualizar_perfil_propio',
        recursoTipo: 'usuario',
        recursoId: String(usuarioId),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: actualizado.id,
        nombre_visualizacion: actualizado.nombre_visualizacion,
        correo_normalizado: actualizado.correo_normalizado,
        activo: actualizado.activo,
        ruta_preferida_id: actualizado.ruta_preferida_id,
        roles: filasRoles.map((r) => r.codigo),
        creado_en: actualizado.creado_en,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();

      if (esErrorFkPostgres(error)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'RUTA_NO_EXISTE',
          'La ruta preferida indicada no existe',
        );
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
