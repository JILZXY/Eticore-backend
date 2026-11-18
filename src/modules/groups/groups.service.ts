import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import {
  codificarCursorId,
  decodificarCursorId,
} from '../../common/utils/paginacion-cursor.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { AgregarIntegranteGrupoDto } from './dto/agregar-integrante-grupo.dto.js';
import type { CrearGrupoDto } from './dto/crear-grupo.dto.js';
import type { ListarGruposDto } from './dto/listar-grupos.dto.js';
import type { ListarIntegrantesGrupoDto } from './dto/listar-integrantes-grupo.dto.js';
import type { RetirarIntegranteGrupoDto } from './dto/retirar-integrante-grupo.dto.js';

export interface GrupoItem {
  id: number;
  nombre: string;
  periodo: string;
  activo: boolean;
  creado_en: Date;
  integrantes_activos?: number;
}

export interface RespuestaListadoGrupos {
  items: GrupoItem[];
  siguiente_cursor: string | null;
}

export interface IntegranteGrupoItem {
  membresia_id: number;
  grupo_id: number;
  usuario_id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  usuario_activo: boolean;
  ingreso: Date;
  salida: Date | null;
  activa: boolean;
}

export interface RespuestaListadoIntegrantes {
  items: IntegranteGrupoItem[];
  siguiente_cursor: string | null;
}

export interface MembresiaGrupoResultado {
  id: number;
  grupo_id: number;
  usuario_id: number;
  ingreso: Date;
  salida: Date | null;
}

interface FilaGrupo {
  id: number;
  nombre: string;
  periodo: string;
  activo: boolean;
  creado_en: Date;
  integrantes_activos?: number;
}

interface FilaIntegranteGrupo {
  membresia_id: string | number;
  grupo_id: number;
  usuario_id: number;
  nombre_visualizacion: string;
  correo_normalizado: string;
  usuario_activo: boolean;
  ingreso: Date;
  salida: Date | null;
}

interface FilaMembresia {
  id: string | number;
  grupo_id: number;
  usuario_id: number;
  ingreso: Date;
  salida: Date | null;
}

function parsearFechaIso(
  valor: string,
  codigoError: string,
  mensaje: string,
): Date {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) {
    throw new DomainError(HttpStatus.BAD_REQUEST, codigoError, mensaje);
  }
  return fecha;
}

function esViolacionUnicidadPostgres(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const err = error as { code?: unknown; driverError?: { code?: unknown } };
  return err.code === '23505' || err.driverError?.code === '23505';
}

@Injectable()
export class GroupsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async crearGrupo(actorId: number, dto: CrearGrupoDto): Promise<GrupoItem> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const filas = (await queryRunner.query(
        `INSERT INTO grupo (nombre, periodo, activo)
         VALUES ($1, $2, TRUE)
         RETURNING id, nombre, periodo, activo, creado_en`,
        [dto.nombre, dto.periodo],
      )) as FilaGrupo[];

      const grupo = filas[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'crear_grupo',
        recursoTipo: 'grupo',
        recursoId: String(grupo.id),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: grupo.id,
        nombre: grupo.nombre,
        periodo: grupo.periodo,
        activo: grupo.activo,
        creado_en: grupo.creado_en,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listarGrupos(dto: ListarGruposDto): Promise<RespuestaListadoGrupos> {
    const limite = dto.limit ?? 20;
    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    let indice = 1;

    if (dto.activo !== undefined) {
      parametros.push(dto.activo);
      condiciones.push(`g.activo = $${indice++}`);
    }

    if (dto.periodo !== undefined && dto.periodo.length > 0) {
      parametros.push(dto.periodo);
      condiciones.push(`g.periodo = $${indice++}`);
    }

    if (dto.cursor) {
      const cursorId = decodificarCursorId(dto.cursor);
      parametros.push(cursorId);
      condiciones.push(`g.id > $${indice++}`);
    }

    parametros.push(limite + 1);
    const paramLimite = `$${indice++}`;

    const clausulaWhere =
      condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

    const filas = (await this.dataSource.query(
      `SELECT
         g.id,
         g.nombre,
         g.periodo,
         g.activo,
         g.creado_en,
         COUNT(mg.id) FILTER (WHERE mg.salida IS NULL)::int AS integrantes_activos
       FROM grupo g
       LEFT JOIN membresia_grupo mg
         ON mg.grupo_id = g.id
       ${clausulaWhere}
       GROUP BY g.id, g.nombre, g.periodo, g.activo, g.creado_en
       ORDER BY g.id ASC
       LIMIT ${paramLimite}`,
      parametros,
    )) as FilaGrupo[];

    const hayMas = filas.length > limite;
    const filasPagina = hayMas ? filas.slice(0, limite) : filas;

    const items: GrupoItem[] = filasPagina.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      periodo: fila.periodo,
      activo: fila.activo,
      creado_en: fila.creado_en,
      integrantes_activos: fila.integrantes_activos ?? 0,
    }));

    const ultimo = items[items.length - 1];
    return {
      items,
      siguiente_cursor: hayMas && ultimo ? codificarCursorId(ultimo.id) : null,
    };
  }

  async obtenerGrupoPorId(grupoId: number): Promise<GrupoItem> {
    const filas = (await this.dataSource.query(
      `SELECT id, nombre, periodo, activo, creado_en
       FROM grupo
       WHERE id = $1
       LIMIT 1`,
      [grupoId],
    )) as FilaGrupo[];

    const grupo = filas[0];
    if (!grupo) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'GRUPO_NO_ENCONTRADO',
        'Grupo no encontrado',
      );
    }

    return {
      id: grupo.id,
      nombre: grupo.nombre,
      periodo: grupo.periodo,
      activo: grupo.activo,
      creado_en: grupo.creado_en,
    };
  }

  async desactivarGrupo(actorId: number, grupoId: number): Promise<GrupoItem> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const bloqueados = (await queryRunner.query(
        `SELECT id, nombre, periodo, activo, creado_en
         FROM grupo
         WHERE id = $1
         FOR UPDATE`,
        [grupoId],
      )) as FilaGrupo[];

      if (bloqueados.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'GRUPO_NO_ENCONTRADO',
          'Grupo no encontrado',
        );
      }

      const resultadoUpdate = await queryRunner.query(
        `UPDATE grupo
         SET activo = FALSE
         WHERE id = $1
         RETURNING id, nombre, periodo, activo, creado_en`,
        [grupoId],
      );
      const grupo = extraerFilasMutacion<FilaGrupo>(resultadoUpdate)[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'desactivar_grupo',
        recursoTipo: 'grupo',
        recursoId: String(grupoId),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: grupo.id,
        nombre: grupo.nombre,
        periodo: grupo.periodo,
        activo: grupo.activo,
        creado_en: grupo.creado_en,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async listarIntegrantes(
    grupoId: number,
    dto: ListarIntegrantesGrupoDto,
  ): Promise<RespuestaListadoIntegrantes> {
    await this.obtenerGrupoPorId(grupoId);

    const limite = dto.limit ?? 20;
    const condiciones: string[] = ['m.grupo_id = $1'];
    const parametros: unknown[] = [grupoId];
    let indice = 2;

    if (dto.solo_activos === true) {
      condiciones.push('m.salida IS NULL');
    } else if (dto.solo_activos === false) {
      condiciones.push('m.salida IS NOT NULL');
    }

    if (dto.cursor) {
      const cursorId = decodificarCursorId(dto.cursor);
      parametros.push(cursorId);
      condiciones.push(`m.id > $${indice++}`);
    }

    parametros.push(limite + 1);
    const paramLimite = `$${indice++}`;

    const filas = (await this.dataSource.query(
      `SELECT
         m.id AS membresia_id,
         m.grupo_id,
         m.usuario_id,
         u.nombre_visualizacion,
         u.correo_normalizado,
         u.activo AS usuario_activo,
         m.ingreso,
         m.salida
       FROM membresia_grupo m
       INNER JOIN usuario u
         ON u.id = m.usuario_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY m.id ASC
       LIMIT ${paramLimite}`,
      parametros,
    )) as FilaIntegranteGrupo[];

    const hayMas = filas.length > limite;
    const filasPagina = hayMas ? filas.slice(0, limite) : filas;

    const items: IntegranteGrupoItem[] = filasPagina.map((fila) => ({
      membresia_id: Number(fila.membresia_id),
      grupo_id: fila.grupo_id,
      usuario_id: fila.usuario_id,
      nombre_visualizacion: fila.nombre_visualizacion,
      correo_normalizado: fila.correo_normalizado,
      usuario_activo: fila.usuario_activo,
      ingreso: fila.ingreso,
      salida: fila.salida,
      activa: fila.salida === null,
    }));

    const ultimo = items[items.length - 1];
    return {
      items,
      siguiente_cursor:
        hayMas && ultimo ? codificarCursorId(ultimo.membresia_id) : null,
    };
  }

  async agregarIntegrante(
    actorId: number,
    grupoId: number,
    dto: AgregarIntegranteGrupoDto,
  ): Promise<MembresiaGrupoResultado> {
    const fechaIngreso = dto.ingreso
      ? parsearFechaIso(
          dto.ingreso,
          'INTERVALO_MEMBRESIA_INVALIDO',
          'Fecha de ingreso inválida',
        )
      : new Date();
    const fechaSalida = dto.salida
      ? parsearFechaIso(
          dto.salida,
          'INTERVALO_MEMBRESIA_INVALIDO',
          'Fecha de salida inválida',
        )
      : null;

    if (
      fechaSalida !== null &&
      fechaSalida.getTime() <= fechaIngreso.getTime()
    ) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'INTERVALO_MEMBRESIA_INVALIDO',
        'La fecha de salida debe ser estrictamente posterior al ingreso',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // Bloquear fila grupo antes de verificar solapamientos para serializar altas sobre ese grupo
      const grupos = (await queryRunner.query(
        `SELECT id, activo
         FROM grupo
         WHERE id = $1
         FOR UPDATE`,
        [grupoId],
      )) as Array<{ id: number; activo: boolean }>;

      const grupo = grupos[0];
      if (!grupo) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'GRUPO_NO_ENCONTRADO',
          'Grupo no encontrado',
        );
      }
      if (!grupo.activo) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'GRUPO_INACTIVO',
          'No se pueden agregar integrantes a un grupo desactivado',
        );
      }

      const usuarios = (await queryRunner.query(
        `SELECT id FROM usuario WHERE id = $1 LIMIT 1`,
        [dto.usuario_id],
      )) as Array<{ id: number }>;

      if (usuarios.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'USUARIO_NO_ENCONTRADO',
          'Usuario no encontrado',
        );
      }

      const solapadas = (await queryRunner.query(
        `SELECT id
         FROM membresia_grupo
         WHERE grupo_id = $1
           AND usuario_id = $2
           AND ($4::timestamptz IS NULL OR ingreso < $4::timestamptz)
           AND (salida IS NULL OR $3::timestamptz < salida)
         LIMIT 1`,
        [
          grupoId,
          dto.usuario_id,
          fechaIngreso.toISOString(),
          fechaSalida ? fechaSalida.toISOString() : null,
        ],
      )) as Array<{ id: string }>;

      if (solapadas.length > 0) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'MEMBRESIA_SOLAPADA',
          'El intervalo de membresía se solapa con otro existente para este integrante',
        );
      }

      const insertadas = (await queryRunner.query(
        `INSERT INTO membresia_grupo (grupo_id, usuario_id, ingreso, salida)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz)
         RETURNING id, grupo_id, usuario_id, ingreso, salida`,
        [
          grupoId,
          dto.usuario_id,
          fechaIngreso.toISOString(),
          fechaSalida ? fechaSalida.toISOString() : null,
        ],
      )) as FilaMembresia[];

      const membresia = insertadas[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'agregar_integrante_grupo',
        recursoTipo: 'membresia_grupo',
        recursoId: String(membresia.id),
        resultado: 'exitoso',
        detalleMinimo: `grupo=${grupoId},usuario=${dto.usuario_id}`,
      });

      await queryRunner.commitTransaction();

      return {
        id: Number(membresia.id),
        grupo_id: membresia.grupo_id,
        usuario_id: membresia.usuario_id,
        ingreso: membresia.ingreso,
        salida: membresia.salida,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      if (esViolacionUnicidadPostgres(error)) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'MEMBRESIA_SOLAPADA',
          'Ya existe una membresía abierta o coincidente para este integrante en el grupo',
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async retirarIntegrante(
    actorId: number,
    grupoId: number,
    usuarioId: number,
    dto: RetirarIntegranteGrupoDto = {},
  ): Promise<MembresiaGrupoResultado> {
    const salidaSolicitada = dto?.salida
      ? parsearFechaIso(
          dto.salida,
          'INTERVALO_MEMBRESIA_INVALIDO',
          'Fecha de salida inválida',
        )
      : null;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const grupos = (await queryRunner.query(
        `SELECT id FROM grupo WHERE id = $1 FOR UPDATE`,
        [grupoId],
      )) as Array<{ id: number }>;

      if (grupos.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'GRUPO_NO_ENCONTRADO',
          'Grupo no encontrado',
        );
      }

      const abiertas = (await queryRunner.query(
        `SELECT id, ingreso
         FROM membresia_grupo
         WHERE grupo_id = $1
           AND usuario_id = $2
           AND salida IS NULL
         FOR UPDATE`,
        [grupoId, usuarioId],
      )) as Array<{ id: string | number; ingreso: Date }>;

      const abierta = abiertas[0];
      if (!abierta) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'MEMBRESIA_ABIERTA_NO_ENCONTRADA',
          'No existe una membresía abierta para este integrante en el grupo',
        );
      }

      const ingresoMs = new Date(abierta.ingreso).getTime();
      let fechaSalida: Date;

      if (salidaSolicitada !== null) {
        if (salidaSolicitada.getTime() <= ingresoMs) {
          throw new DomainError(
            HttpStatus.BAD_REQUEST,
            'INTERVALO_MEMBRESIA_INVALIDO',
            'La fecha de salida debe ser estrictamente posterior al ingreso',
          );
        }
        fechaSalida = salidaSolicitada;
      } else {
        fechaSalida = new Date(Math.max(Date.now(), ingresoMs + 1));
      }

      const solapadas = (await queryRunner.query(
        `SELECT id
         FROM membresia_grupo
         WHERE grupo_id = $1
           AND usuario_id = $2
           AND id <> $3
           AND ingreso < $4::timestamptz
           AND (salida IS NULL OR $5::timestamptz < salida)
         LIMIT 1`,
        [
          grupoId,
          usuarioId,
          abierta.id,
          fechaSalida.toISOString(),
          new Date(abierta.ingreso).toISOString(),
        ],
      )) as Array<{ id: string }>;

      if (solapadas.length > 0) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'MEMBRESIA_SOLAPADA',
          'El cierre del intervalo se solapa con otro registro existente para este integrante',
        );
      }

      const resultadoUpdate = await queryRunner.query(
        `UPDATE membresia_grupo
         SET salida = $1::timestamptz
         WHERE id = $2
         RETURNING id, grupo_id, usuario_id, ingreso, salida`,
        [fechaSalida.toISOString(), abierta.id],
      );
      const cerrada = extraerFilasMutacion<FilaMembresia>(resultadoUpdate)[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'retirar_integrante_grupo',
        recursoTipo: 'membresia_grupo',
        recursoId: String(cerrada.id),
        resultado: 'exitoso',
        detalleMinimo: `grupo=${grupoId},usuario=${usuarioId}`,
      });

      await queryRunner.commitTransaction();

      return {
        id: Number(cerrada.id),
        grupo_id: cerrada.grupo_id,
        usuario_id: cerrada.usuario_id,
        ingreso: cerrada.ingreso,
        salida: cerrada.salida,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
