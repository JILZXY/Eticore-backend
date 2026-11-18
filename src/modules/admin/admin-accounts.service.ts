import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { RolCodigo } from '../../common/decorators/roles.decorator.js';
import { DomainError } from '../../common/errors/domain.error.js';
import {
  codificarCursorId,
  decodificarCursorId,
} from '../../common/utils/paginacion-cursor.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { ListarCuentasAdminDto } from './dto/listar-cuentas-admin.dto.js';

export interface CuentaAdminItem {
  id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  activo: boolean;
  ruta_preferida_id: number | null;
  roles: RolCodigo[];
  creado_en: Date;
}

export interface RespuestaListadoCuentasAdmin {
  items: CuentaAdminItem[];
  siguiente_cursor: string | null;
}

export interface ResultadoDesactivarCuenta extends CuentaAdminItem {
  sesiones_revocadas: number;
}

interface FilaUsuarioAdmin {
  id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  activo: boolean;
  ruta_preferida_id: number | null;
  creado_en: Date;
  roles?: unknown;
}

function normalizarRolesArray(valor: unknown): RolCodigo[] {
  if (Array.isArray(valor)) {
    return valor as RolCodigo[];
  }
  if (typeof valor === 'string' && valor.startsWith('{') && valor.endsWith('}')) {
    const interior = valor.slice(1, -1).trim();
    if (interior.length === 0) {
      return [];
    }
    return interior.split(',') as RolCodigo[];
  }
  return [];
}

@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async listarCuentas(
    dto: ListarCuentasAdminDto,
  ): Promise<RespuestaListadoCuentasAdmin> {
    const limite = dto.limit ?? 20;
    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    let indice = 1;

    if (dto.activo !== undefined) {
      parametros.push(dto.activo);
      condiciones.push(`u.activo = $${indice++}`);
    }

    if (dto.rol !== undefined) {
      parametros.push(dto.rol);
      condiciones.push(`EXISTS (
        SELECT 1
        FROM usuario_rol ur_filtro
        INNER JOIN rol r_filtro ON r_filtro.id = ur_filtro.rol_id
        WHERE ur_filtro.usuario_id = u.id
          AND r_filtro.codigo = $${indice++}
      )`);
    }

    if (dto.cursor) {
      const cursorId = decodificarCursorId(dto.cursor);
      parametros.push(cursorId);
      condiciones.push(`u.id > $${indice++}`);
    }

    parametros.push(limite + 1);
    const paramLimite = `$${indice++}`;

    const clausulaWhere =
      condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const filas = (await this.dataSource.query(
      `SELECT
         u.id,
         u.nombre_visualizacion,
         u.correo_normalizado,
         u.activo,
         u.ruta_preferida_id,
         u.creado_en,
         COALESCE(
           ARRAY_AGG(r.codigo ORDER BY r.id) FILTER (WHERE r.codigo IS NOT NULL),
           '{}'
         ) AS roles
       FROM usuario u
       LEFT JOIN usuario_rol ur ON ur.usuario_id = u.id
       LEFT JOIN rol r ON r.id = ur.rol_id
       ${clausulaWhere}
       GROUP BY u.id, u.nombre_visualizacion, u.correo_normalizado, u.activo, u.ruta_preferida_id, u.creado_en
       ORDER BY u.id ASC
       LIMIT ${paramLimite}`,
      parametros,
    )) as FilaUsuarioAdmin[];

    const hayMas = filas.length > limite;
    const filasPagina = hayMas ? filas.slice(0, limite) : filas;

    const items: CuentaAdminItem[] = filasPagina.map((fila) => ({
      id: fila.id,
      nombre_visualizacion: fila.nombre_visualizacion,
      correo_normalizado: fila.correo_normalizado,
      activo: fila.activo,
      ruta_preferida_id: fila.ruta_preferida_id,
      roles: normalizarRolesArray(fila.roles),
      creado_en: fila.creado_en,
    }));

    const ultimo = items[items.length - 1];
    return {
      items,
      siguiente_cursor: hayMas && ultimo ? codificarCursorId(ultimo.id) : null,
    };
  }

  async activarCuenta(
    actorId: number,
    usuarioId: number,
  ): Promise<CuentaAdminItem> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const usuarios = (await queryRunner.query(
        `SELECT id, nombre_visualizacion, correo_normalizado, activo, ruta_preferida_id, creado_en
         FROM usuario
         WHERE id = $1
         FOR UPDATE`,
        [usuarioId],
      )) as FilaUsuarioAdmin[];

      if (usuarios.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'USUARIO_NO_ENCONTRADO',
          'Usuario no encontrado',
        );
      }

      const resultadoUpdate = await queryRunner.query(
        `UPDATE usuario
         SET activo = TRUE
         WHERE id = $1
         RETURNING id, nombre_visualizacion, correo_normalizado, activo, ruta_preferida_id, creado_en`,
        [usuarioId],
      );
      const actualizado =
        extraerFilasMutacion<FilaUsuarioAdmin>(resultadoUpdate)[0];

      const filasRoles = (await queryRunner.query(
        `SELECT r.codigo
         FROM usuario_rol ur
         INNER JOIN rol r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1
         ORDER BY r.id ASC`,
        [usuarioId],
      )) as Array<{ codigo: RolCodigo }>;

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'activar_cuenta',
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
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async desactivarCuenta(
    actorId: number,
    usuarioId: number,
  ): Promise<ResultadoDesactivarCuenta> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // RN-29: bloquear primero la guarda común antes de contar técnicos activos
      await queryRunner.query(
        `SELECT clave
         FROM guarda_integridad
         WHERE clave = 'admin_tecnico_activo'
         FOR UPDATE`,
      );

      const usuarios = (await queryRunner.query(
        `SELECT id, nombre_visualizacion, correo_normalizado, activo, ruta_preferida_id, creado_en
         FROM usuario
         WHERE id = $1
         FOR UPDATE`,
        [usuarioId],
      )) as FilaUsuarioAdmin[];

      const actual = usuarios[0];
      if (!actual) {
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
         ORDER BY r.id ASC`,
        [usuarioId],
      )) as Array<{ codigo: RolCodigo }>;
      const roles = filasRoles.map((r) => r.codigo);

      if (actual.activo && roles.includes('ADMIN_TECNICO')) {
        const restantes = (await queryRunner.query(
          `SELECT COUNT(DISTINCT u.id)::int AS total
           FROM usuario u
           INNER JOIN usuario_rol ur ON ur.usuario_id = u.id
           INNER JOIN rol r ON r.id = ur.rol_id
           WHERE u.activo = TRUE
             AND r.codigo = 'ADMIN_TECNICO'
             AND u.id <> $1`,
          [usuarioId],
        )) as Array<{ total: number }>;

        if ((restantes[0]?.total ?? 0) < 1) {
          throw new DomainError(
            HttpStatus.CONFLICT,
            'ULTIMO_ADMIN_TECNICO_ACTIVO',
            'No se puede desactivar el último administrador técnico activo',
          );
        }
      }

      const resultadoUpdate = await queryRunner.query(
        `UPDATE usuario
         SET activo = FALSE
         WHERE id = $1
         RETURNING id, nombre_visualizacion, correo_normalizado, activo, ruta_preferida_id, creado_en`,
        [usuarioId],
      );
      const actualizado =
        extraerFilasMutacion<FilaUsuarioAdmin>(resultadoUpdate)[0];

      const resultadoSesiones = await queryRunner.query(
        `UPDATE sesion
         SET revocada_en = CURRENT_TIMESTAMP
         WHERE usuario_id = $1
           AND revocada_en IS NULL
         RETURNING usuario_id`,
        [usuarioId],
      );
      const sesionesRevocadas = extraerFilasMutacion<{ usuario_id: number }>(
        resultadoSesiones,
      ).length;

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'desactivar_cuenta',
        recursoTipo: 'usuario',
        recursoId: String(usuarioId),
        resultado: 'exitoso',
        detalleMinimo: `sesiones_revocadas=${sesionesRevocadas}`,
      });

      await queryRunner.commitTransaction();

      return {
        id: actualizado.id,
        nombre_visualizacion: actualizado.nombre_visualizacion,
        correo_normalizado: actualizado.correo_normalizado,
        activo: actualizado.activo,
        ruta_preferida_id: actualizado.ruta_preferida_id,
        roles,
        creado_en: actualizado.creado_en,
        sesiones_revocadas: sesionesRevocadas,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
