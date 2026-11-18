import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { RolCodigo } from '../../common/decorators/roles.decorator.js';
import { DomainError } from '../../common/errors/domain.error.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { CambiarRolUsuarioDto } from './dto/cambiar-rol-usuario.dto.js';

export interface ResultadoCambioRol {
  usuario_id: number;
  rol: RolCodigo;
  roles: RolCodigo[];
}

export interface ResultadoRetiroRol {
  usuario_id: number;
  rol_retirado: RolCodigo;
  roles: RolCodigo[];
}

function resolverCodigoRol(dto: CambiarRolUsuarioDto): RolCodigo {
  const codigo = dto.rol_codigo ?? dto.rol;
  if (!codigo) {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'ROL_REQUERIDO',
      'Debes especificar rol_codigo',
    );
  }
  return codigo;
}

@Injectable()
export class AdminRolesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async asignarRol(
    actorId: number,
    dto: CambiarRolUsuarioDto,
  ): Promise<ResultadoCambioRol> {
    const codigoRol = resolverCodigoRol(dto);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const usuarios = (await queryRunner.query(
        `SELECT id, activo FROM usuario WHERE id = $1 FOR UPDATE`,
        [dto.usuario_id],
      )) as Array<{ id: number; activo: boolean }>;

      if (usuarios.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'USUARIO_NO_ENCONTRADO',
          'Usuario no encontrado',
        );
      }

      const roles = (await queryRunner.query(
        `SELECT id, codigo FROM rol WHERE codigo = $1 LIMIT 1`,
        [codigoRol],
      )) as Array<{ id: number; codigo: RolCodigo }>;

      const rol = roles[0];
      if (!rol) {
        throw new DomainError(
          HttpStatus.BAD_REQUEST,
          'ROL_INVALIDO',
          'El rol indicado no existe en el catálogo',
        );
      }

      await queryRunner.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         VALUES ($1, $2)
         ON CONFLICT (usuario_id, rol_id) DO NOTHING`,
        [dto.usuario_id, rol.id],
      );

      const rolesActuales = (await queryRunner.query(
        `SELECT r.codigo
         FROM usuario_rol ur
         INNER JOIN rol r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1
         ORDER BY r.id ASC`,
        [dto.usuario_id],
      )) as Array<{ codigo: RolCodigo }>;

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'asignar_rol',
        recursoTipo: 'usuario_rol',
        recursoId: `${dto.usuario_id}:${codigoRol}`,
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        usuario_id: dto.usuario_id,
        rol: codigoRol,
        roles: rolesActuales.map((r) => r.codigo),
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async retirarRol(
    actorId: number,
    dto: CambiarRolUsuarioDto,
  ): Promise<ResultadoRetiroRol> {
    const codigoRol = resolverCodigoRol(dto);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // RN-29: bloquear primero la guarda común antes de contar y modificar
      await queryRunner.query(
        `SELECT clave
         FROM guarda_integridad
         WHERE clave = 'admin_tecnico_activo'
         FOR UPDATE`,
      );

      const usuarios = (await queryRunner.query(
        `SELECT id, activo FROM usuario WHERE id = $1 FOR UPDATE`,
        [dto.usuario_id],
      )) as Array<{ id: number; activo: boolean }>;

      const usuario = usuarios[0];
      if (!usuario) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'USUARIO_NO_ENCONTRADO',
          'Usuario no encontrado',
        );
      }

      const rolesCatalogo = (await queryRunner.query(
        `SELECT id, codigo FROM rol WHERE codigo = $1 LIMIT 1`,
        [codigoRol],
      )) as Array<{ id: number; codigo: RolCodigo }>;

      const rol = rolesCatalogo[0];
      if (!rol) {
        throw new DomainError(
          HttpStatus.BAD_REQUEST,
          'ROL_INVALIDO',
          'El rol indicado no existe en el catálogo',
        );
      }

      const asignaciones = (await queryRunner.query(
        `SELECT usuario_id
         FROM usuario_rol
         WHERE usuario_id = $1 AND rol_id = $2
         LIMIT 1`,
        [dto.usuario_id, rol.id],
      )) as Array<{ usuario_id: number }>;

      if (asignaciones.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'ROL_NO_ASIGNADO',
          'La cuenta no tiene asignado ese rol',
        );
      }

      if (codigoRol === 'ADMIN_TECNICO' && usuario.activo) {
        const restantes = (await queryRunner.query(
          `SELECT COUNT(DISTINCT u.id)::int AS total
           FROM usuario u
           INNER JOIN usuario_rol ur ON ur.usuario_id = u.id
           INNER JOIN rol r ON r.id = ur.rol_id
           WHERE u.activo = TRUE
             AND r.codigo = 'ADMIN_TECNICO'
             AND u.id <> $1`,
          [dto.usuario_id],
        )) as Array<{ total: number }>;

        if ((restantes[0]?.total ?? 0) < 1) {
          throw new DomainError(
            HttpStatus.CONFLICT,
            'ULTIMO_ADMIN_TECNICO_ACTIVO',
            'No se puede retirar el rol ADMIN_TECNICO al último administrador técnico activo',
          );
        }
      }

      await queryRunner.query(
        `DELETE FROM usuario_rol
         WHERE usuario_id = $1 AND rol_id = $2`,
        [dto.usuario_id, rol.id],
      );

      // Evitar cuentas sin ningún rol en el sistema conservando el rol base APRENDIZ
      await queryRunner.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         SELECT $1, id
         FROM rol
         WHERE codigo = 'APRENDIZ'
           AND NOT EXISTS (
             SELECT 1 FROM usuario_rol WHERE usuario_id = $1
           )
         ON CONFLICT (usuario_id, rol_id) DO NOTHING`,
        [dto.usuario_id],
      );

      const rolesActuales = (await queryRunner.query(
        `SELECT r.codigo
         FROM usuario_rol ur
         INNER JOIN rol r ON r.id = ur.rol_id
         WHERE ur.usuario_id = $1
         ORDER BY r.id ASC`,
        [dto.usuario_id],
      )) as Array<{ codigo: RolCodigo }>;

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'retirar_rol',
        recursoTipo: 'usuario_rol',
        recursoId: `${dto.usuario_id}:${codigoRol}`,
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        usuario_id: dto.usuario_id,
        rol_retirado: codigoRol,
        roles: rolesActuales.map((r) => r.codigo),
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
