import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import {
  ContentValidatorService,
  type TipoUnidad,
} from '../../shared/validation/content-validator.service.js';
import { ScoringService } from '../../shared/validation/scoring.service.js';
import type { ConsultarHistorialDto } from './dto/consultar-historial.dto.js';
import type { CrearIntentoDto } from './dto/crear-intento.dto.js';

export interface IntentoDetalle {
  id: string;
  unidad_id: number;
  version_id: number;
  version_numero: number;
  tipo: TipoUnidad;
  titulo: string;
  numero: number;
  estado: 'en_curso' | 'finalizado';
  inicio: Date;
  finalizacion: Date | null;
  puntuacion: number | null;
  revision: number;
  esquema_version: number;
  recorrido: Record<string, unknown>;
  contenido: Record<string, unknown>;
}

export interface CabeceraHistorialIntento {
  id: string;
  unidad_id: number;
  version_id: number;
  version_numero: number;
  unidad_titulo: string;
  tipo: TipoUnidad;
  numero: number;
  estado: 'en_curso' | 'finalizado';
  inicio: Date;
  finalizacion: Date | null;
  puntuacion: number | null;
  revision: number;
}

export interface RespuestaHistorialIntentos {
  items: CabeceraHistorialIntento[];
  siguiente_cursor: string | null;
}

export interface ResultadoIntentoHistorico {
  id: string;
  unidad_id: number;
  version_id: number;
  version_numero: number;
  tipo: TipoUnidad;
  titulo: string;
  numero: number;
  estado: 'finalizado';
  inicio: Date;
  finalizacion: Date;
  puntuacion: number | null;
  revision: number;
  retroalimentacion: Record<string, unknown>;
}

interface FilaIntentoConVersion {
  id: string;
  usuario_id: number;
  unidad_id: number;
  version_id: string | number;
  version_numero: number;
  tipo: TipoUnidad;
  titulo: string;
  numero: number;
  estado: 'en_curso' | 'finalizado';
  inicio: Date;
  finalizacion: Date | null;
  puntuacion: string | null;
  revision: number;
  esquema_version: number;
  recorrido: Record<string, unknown>;
  contenido: Record<string, unknown>;
}

interface FilaVersionPublicada {
  unidad_id: number;
  tipo: TipoUnidad;
  version_id: string | number;
  version_numero: number;
  titulo: string;
  esquema_version: number;
  contenido: Record<string, unknown>;
}

interface FilaHistorial {
  id: string;
  unidad_id: number;
  version_id: string | number;
  version_numero: number;
  unidad_titulo: string;
  tipo: TipoUnidad;
  numero: number;
  estado: 'en_curso' | 'finalizado';
  inicio: Date;
  finalizacion: Date | null;
  puntuacion: string | null;
  revision: number;
  fecha_orden: Date;
}

function codificarCursorHistorial(fecha: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ fecha: fecha.toISOString(), id }),
    'utf8',
  ).toString('base64url');
}

function decodificarCursorHistorial(cursor: string): {
  fecha: string;
  id: string;
} {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as { fecha?: unknown; id?: unknown };
    if (
      typeof parsed.fecha !== 'string' ||
      Number.isNaN(Date.parse(parsed.fecha)) ||
      typeof parsed.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        parsed.id,
      )
    ) {
      throw new Error('Cursor invalido');
    }
    return { fecha: parsed.fecha, id: parsed.id };
  } catch {
    throw new DomainError(
      HttpStatus.BAD_REQUEST,
      'CURSOR_INVALIDO',
      'El cursor de paginación no es válido',
    );
  }
}

@Injectable()
export class AttemptsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contentValidator: ContentValidatorService,
    private readonly scoringService: ScoringService,
    private readonly auditService: AuditService,
  ) {}

  async crearIntento(
    usuarioId: number,
    dto: CrearIntentoDto,
  ): Promise<IntentoDetalle> {
    const intentoId = dto.id ?? randomUUID();

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const usuarios = (await queryRunner.query(
        `SELECT id FROM usuario WHERE id = $1 AND activo = TRUE FOR UPDATE`,
        [usuarioId],
      )) as Array<{ id: number }>;

      if (usuarios.length === 0) {
        throw new DomainError(
          HttpStatus.UNAUTHORIZED,
          'SESION_INVALIDA',
          'Usuario no disponible',
        );
      }

      // Idempotencia: si el intento ya existe, devolver el mismo si es del mismo usuario y unidad.
      const existentes = (await queryRunner.query(
        `SELECT
           i.id,
           i.usuario_id,
           i.unidad_id,
           i.version_id,
           vu.numero AS version_numero,
           u.tipo,
           vu.titulo,
           i.numero,
           i.estado,
           i.inicio,
           i.finalizacion,
           i.puntuacion,
           i.revision,
           i.esquema_version,
           i.recorrido,
           vu.contenido
         FROM intento i
         INNER JOIN unidad u ON u.id = i.unidad_id
         INNER JOIN version_unidad vu
           ON vu.id = i.version_id
          AND vu.unidad_id = i.unidad_id
         WHERE i.id = $1
         LIMIT 1`,
        [intentoId],
      )) as FilaIntentoConVersion[];

      const existente = existentes[0];
      if (existente) {
        if (
          existente.usuario_id !== usuarioId ||
          existente.unidad_id !== dto.unidad_id
        ) {
          throw new DomainError(
            HttpStatus.CONFLICT,
            'INTENTO_ID_CONFLICTO',
            'El identificador del intento ya está en uso',
          );
        }
        await queryRunner.commitTransaction();
        return this.mapearIntentoDetalle(existente);
      }

      const unidades = (await queryRunner.query(
        `SELECT
           u.id AS unidad_id,
           u.tipo,
           vu.id AS version_id,
           vu.numero AS version_numero,
           vu.titulo,
           vu.esquema_version,
           vu.contenido
         FROM unidad u
         INNER JOIN version_unidad vu
           ON vu.id = u.version_publicada_id
          AND vu.unidad_id = u.id
          AND vu.estado = 'publicado'
         WHERE u.id = $1
           AND u.activa = TRUE
         LIMIT 1`,
        [dto.unidad_id],
      )) as FilaVersionPublicada[];

      const versionPublicada = unidades[0];
      if (!versionPublicada) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'UNIDAD_NO_ENCONTRADA',
          'Unidad no encontrada o no publicada',
        );
      }

      // Ordinal calculado bajo bloqueo exclusivo de la fila usuario (nunca MAX+1 sin bloqueo).
      const ordinales = (await queryRunner.query(
        `SELECT COALESCE(MAX(numero), 0)::int + 1 AS siguiente
         FROM intento
         WHERE usuario_id = $1 AND unidad_id = $2`,
        [usuarioId, dto.unidad_id],
      )) as Array<{ siguiente: number }>;

      const numero = ordinales[0].siguiente;
      const recorridoInicial = this.scoringService.crearRecorridoInicial(
        versionPublicada.tipo,
        versionPublicada.contenido,
      );

      const insertados = (await queryRunner.query(
        `INSERT INTO intento (
           id,
           usuario_id,
           unidad_id,
           version_id,
           numero,
           estado,
           esquema_version,
           recorrido
         ) VALUES ($1, $2, $3, $4, $5, 'en_curso', $6, $7::jsonb)
         RETURNING id, usuario_id, unidad_id, version_id, numero, estado, inicio, finalizacion, puntuacion, revision, esquema_version, recorrido`,
        [
          intentoId,
          usuarioId,
          dto.unidad_id,
          versionPublicada.version_id,
          numero,
          versionPublicada.esquema_version,
          JSON.stringify(recorridoInicial),
        ],
      )) as Array<{
        id: string;
        usuario_id: number;
        unidad_id: number;
        version_id: string | number;
        numero: number;
        estado: 'en_curso' | 'finalizado';
        inicio: Date;
        finalizacion: Date | null;
        puntuacion: string | null;
        revision: number;
        esquema_version: number;
        recorrido: Record<string, unknown>;
      }>;

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuarioId,
        origenActor: 'usuario',
        accion: 'iniciar_intento',
        recursoTipo: 'intento',
        recursoId: intentoId,
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return this.mapearIntentoDetalle({
        ...insertados[0],
        version_numero: versionPublicada.version_numero,
        tipo: versionPublicada.tipo,
        titulo: versionPublicada.titulo,
        contenido: versionPublicada.contenido,
      });
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async obtenerIntento(
    usuarioId: number,
    intentoId: string,
  ): Promise<IntentoDetalle> {
    const filas = (await this.dataSource.query(
      `SELECT
         i.id,
         i.usuario_id,
         i.unidad_id,
         i.version_id,
         vu.numero AS version_numero,
         u.tipo,
         vu.titulo,
         i.numero,
         i.estado,
         i.inicio,
         i.finalizacion,
         i.puntuacion,
         i.revision,
         i.esquema_version,
         i.recorrido,
         vu.contenido
       FROM intento i
       INNER JOIN unidad u ON u.id = i.unidad_id
       INNER JOIN version_unidad vu
         ON vu.id = i.version_id
        AND vu.unidad_id = i.unidad_id
       WHERE i.id = $1
         AND i.usuario_id = $2
       LIMIT 1`,
      [intentoId, usuarioId],
    )) as FilaIntentoConVersion[];

    const fila = filas[0];
    if (!fila) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'INTENTO_NO_ENCONTRADO',
        'Intento no encontrado',
      );
    }

    return this.mapearIntentoDetalle(fila);
  }

  async listarHistorial(
    usuarioId: number,
    dto: ConsultarHistorialDto,
  ): Promise<RespuestaHistorialIntentos> {
    const limite = dto.limit ?? 20;
    const condiciones: string[] = ['i.usuario_id = $1'];
    const parametros: unknown[] = [usuarioId];
    let indice = 2;

    if (dto.unidad_id !== undefined) {
      parametros.push(dto.unidad_id);
      condiciones.push(`i.unidad_id = $${indice++}`);
    }

    if (dto.cursor) {
      const cursor = decodificarCursorHistorial(dto.cursor);
      parametros.push(cursor.fecha, cursor.id);
      const paramFecha = `$${indice++}`;
      const paramId = `$${indice++}`;
      condiciones.push(
        `(COALESCE(i.finalizacion, i.inicio), i.id) < (${paramFecha}::timestamptz, ${paramId}::uuid)`,
      );
    }

    parametros.push(limite + 1);
    const paramLimite = `$${indice++}`;

    // Proyeccion de cabeceras sin i.recorrido (REQ-F-38)
    const filas = (await this.dataSource.query(
      `SELECT
         i.id,
         i.unidad_id,
         i.version_id,
         vu.numero AS version_numero,
         vu.titulo AS unidad_titulo,
         u.tipo,
         i.numero,
         i.estado,
         i.inicio,
         i.finalizacion,
         i.puntuacion,
         i.revision,
         COALESCE(i.finalizacion, i.inicio) AS fecha_orden
       FROM intento i
       INNER JOIN unidad u ON u.id = i.unidad_id
       INNER JOIN version_unidad vu
         ON vu.id = i.version_id
        AND vu.unidad_id = i.unidad_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY COALESCE(i.finalizacion, i.inicio) DESC, i.id DESC
       LIMIT ${paramLimite}`,
      parametros,
    )) as FilaHistorial[];

    const hayMas = filas.length > limite;
    const pagina = hayMas ? filas.slice(0, limite) : filas;

    const items: CabeceraHistorialIntento[] = pagina.map((f) => ({
      id: f.id,
      unidad_id: f.unidad_id,
      version_id: Number(f.version_id),
      version_numero: f.version_numero,
      unidad_titulo: f.unidad_titulo,
      tipo: f.tipo,
      numero: f.numero,
      estado: f.estado,
      inicio: f.inicio,
      finalizacion: f.finalizacion,
      puntuacion: f.puntuacion !== null ? Number(f.puntuacion) : null,
      revision: f.revision,
    }));

    const ultimo = pagina[pagina.length - 1];
    return {
      items,
      siguiente_cursor:
        hayMas && ultimo
          ? codificarCursorHistorial(new Date(ultimo.fecha_orden), ultimo.id)
          : null,
    };
  }

  async obtenerResultado(
    usuarioId: number,
    intentoId: string,
  ): Promise<ResultadoIntentoHistorico> {
    const filas = (await this.dataSource.query(
      `SELECT
         i.id,
         i.usuario_id,
         i.unidad_id,
         i.version_id,
         vu.numero AS version_numero,
         u.tipo,
         vu.titulo,
         i.numero,
         i.estado,
         i.inicio,
         i.finalizacion,
         i.puntuacion,
         i.revision,
         i.esquema_version,
         i.recorrido,
         vu.contenido
       FROM intento i
       INNER JOIN unidad u ON u.id = i.unidad_id
       INNER JOIN version_unidad vu
         ON vu.id = i.version_id
        AND vu.unidad_id = i.unidad_id
       WHERE i.id = $1
         AND i.usuario_id = $2
       LIMIT 1`,
      [intentoId, usuarioId],
    )) as FilaIntentoConVersion[];

    const fila = filas[0];
    if (!fila) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'INTENTO_NO_ENCONTRADO',
        'Intento no encontrado',
      );
    }

    if (fila.estado !== 'finalizado' || fila.finalizacion === null) {
      throw new DomainError(
        HttpStatus.CONFLICT,
        'INTENTO_NO_FINALIZADO',
        'El intento aún está en curso',
      );
    }

    const retroalimentacion =
      this.scoringService.construirRetroalimentacionHistorica(
        fila.tipo,
        fila.contenido,
        fila.recorrido,
      );

    return {
      id: fila.id,
      unidad_id: fila.unidad_id,
      version_id: Number(fila.version_id),
      version_numero: fila.version_numero,
      tipo: fila.tipo,
      titulo: fila.titulo,
      numero: fila.numero,
      estado: 'finalizado',
      inicio: fila.inicio,
      finalizacion: fila.finalizacion,
      puntuacion: fila.puntuacion !== null ? Number(fila.puntuacion) : null,
      revision: fila.revision,
      retroalimentacion,
    };
  }

  private mapearIntentoDetalle(fila: FilaIntentoConVersion): IntentoDetalle {
    return {
      id: fila.id,
      unidad_id: fila.unidad_id,
      version_id: Number(fila.version_id),
      version_numero: fila.version_numero,
      tipo: fila.tipo,
      titulo: fila.titulo,
      numero: fila.numero,
      estado: fila.estado,
      inicio: fila.inicio,
      finalizacion: fila.finalizacion,
      puntuacion: fila.puntuacion !== null ? Number(fila.puntuacion) : null,
      revision: fila.revision,
      esquema_version: fila.esquema_version,
      recorrido: fila.recorrido,
      contenido: this.contentValidator.proyectarContenidoParaAprendiz(
        fila.tipo,
        fila.contenido,
      ),
    };
  }
}
