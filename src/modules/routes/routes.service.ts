import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { CambiarRutaDto } from './dto/cambiar-ruta.dto.js';

export interface RutaDisponibleItem {
  id: number;
  nombre: string;
  version_actual_id: number;
  version_numero: number;
  publicada_en: Date | null;
  total_unidades: number;
  unidades_obligatorias: number;
}

export interface InscripcionRutaResultado {
  inscripcion_id: number;
  ruta_id: number;
  ruta_nombre: string;
  ruta_version_id: number;
  version_numero: number;
  inscrita_en: Date;
  migrada_de_id: number | null;
}

interface FilaRutaActiva {
  id: number;
  nombre: string;
  version_actual_id: string | number;
  version_numero: number;
}

interface FilaInscripcion {
  id: string | number;
  ruta_version_id: string | number;
  inscrita_en: Date;
  migrada_de_id: string | number | null;
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async listarRutas(): Promise<RutaDisponibleItem[]> {
    const filas = (await this.dataSource.query(
      `SELECT
         r.id,
         r.nombre,
         r.version_actual_id,
         vr.numero AS version_numero,
         vr.publicada_en,
         COUNT(ru.unidad_id)::int AS total_unidades,
         COUNT(*) FILTER (WHERE ru.obligatoria = TRUE)::int AS unidades_obligatorias
       FROM ruta r
       INNER JOIN version_ruta vr
         ON vr.id = r.version_actual_id
        AND vr.ruta_id = r.id
       LEFT JOIN ruta_unidad ru
         ON ru.ruta_version_id = vr.id
       WHERE r.activa = TRUE
         AND r.version_actual_id IS NOT NULL
       GROUP BY r.id, r.nombre, r.version_actual_id, vr.numero, vr.publicada_en
       ORDER BY r.id ASC`,
    )) as Array<{
      id: number;
      nombre: string;
      version_actual_id: string | number;
      version_numero: number;
      publicada_en: Date | null;
      total_unidades: number;
      unidades_obligatorias: number;
    }>;

    return filas.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      version_actual_id: Number(f.version_actual_id),
      version_numero: f.version_numero,
      publicada_en: f.publicada_en,
      total_unidades: f.total_unidades,
      unidades_obligatorias: f.unidades_obligatorias,
    }));
  }

  elegirRuta(
    usuarioId: number,
    rutaId: number,
  ): Promise<InscripcionRutaResultado> {
    return this.inscribirYSeleccionarRuta({
      usuarioId,
      rutaId,
      accionAuditoria: 'elegir_ruta',
    });
  }

  cambiarRuta(
    usuarioId: number,
    dto: CambiarRutaDto,
  ): Promise<InscripcionRutaResultado> {
    return this.inscribirYSeleccionarRuta({
      usuarioId,
      rutaId: dto.ruta_id,
      accionAuditoria: 'cambiar_ruta',
    });
  }

  private async inscribirYSeleccionarRuta(params: {
    usuarioId: number;
    rutaId: number;
    accionAuditoria: 'elegir_ruta' | 'cambiar_ruta';
  }): Promise<InscripcionRutaResultado> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const usuarios = (await queryRunner.query(
        `SELECT id FROM usuario WHERE id = $1 AND activo = TRUE FOR UPDATE`,
        [params.usuarioId],
      )) as Array<{ id: number }>;

      if (usuarios.length === 0) {
        throw new DomainError(
          HttpStatus.UNAUTHORIZED,
          'SESION_INVALIDA',
          'Usuario no disponible',
        );
      }

      const rutas = (await queryRunner.query(
        `SELECT
           r.id,
           r.nombre,
           r.version_actual_id,
           vr.numero AS version_numero
         FROM ruta r
         INNER JOIN version_ruta vr
           ON vr.id = r.version_actual_id
          AND vr.ruta_id = r.id
         WHERE r.id = $1
           AND r.activa = TRUE
           AND r.version_actual_id IS NOT NULL
         LIMIT 1`,
        [params.rutaId],
      )) as FilaRutaActiva[];

      const ruta = rutas[0];
      if (!ruta) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'RUTA_NO_ENCONTRADA',
          'Ruta no encontrada o no disponible',
        );
      }

      // Crea otra inscripcion contra la version actual sin migrar progreso ni borrar inscripciones previas.
      const insertadas = (await queryRunner.query(
        `INSERT INTO inscripcion_ruta (usuario_id, ruta_version_id)
         VALUES ($1, $2)
         ON CONFLICT (usuario_id, ruta_version_id) DO NOTHING
         RETURNING id, ruta_version_id, inscrita_en, migrada_de_id`,
        [params.usuarioId, ruta.version_actual_id],
      )) as FilaInscripcion[];

      let inscripcion = insertadas[0];
      if (!inscripcion) {
        const existentes = (await queryRunner.query(
          `SELECT id, ruta_version_id, inscrita_en, migrada_de_id
           FROM inscripcion_ruta
           WHERE usuario_id = $1
             AND ruta_version_id = $2
           LIMIT 1`,
          [params.usuarioId, ruta.version_actual_id],
        )) as FilaInscripcion[];
        inscripcion = existentes[0];
      }

      await queryRunner.query(
        `UPDATE usuario
         SET ruta_preferida_id = $1
         WHERE id = $2`,
        [ruta.id, params.usuarioId],
      );

      await this.auditService.registrar(queryRunner.manager, {
        actorId: params.usuarioId,
        origenActor: 'usuario',
        accion: params.accionAuditoria,
        recursoTipo: 'ruta',
        recursoId: String(ruta.id),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        inscripcion_id: Number(inscripcion.id),
        ruta_id: ruta.id,
        ruta_nombre: ruta.nombre,
        ruta_version_id: Number(inscripcion.ruta_version_id),
        version_numero: ruta.version_numero,
        inscrita_en: inscripcion.inscrita_en,
        migrada_de_id:
          inscripcion.migrada_de_id !== null
            ? Number(inscripcion.migrada_de_id)
            : null,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
