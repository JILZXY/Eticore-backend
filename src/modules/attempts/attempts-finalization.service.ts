import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { TipoUnidad } from '../../shared/validation/content-validator.service.js';
import { ScoringService } from '../../shared/validation/scoring.service.js';
import {
  GamificationService,
  type InsigniaConcedida,
} from '../gamification/gamification.service.js';
import type { FinalizarIntentoDto } from './dto/finalizar-intento.dto.js';

export interface ResultadoFinalizacionIntento {
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
  credito_otorgado: boolean;
  puntos_acreditados: number;
  insignias_concedidas: InsigniaConcedida[];
  retroalimentacion: Record<string, unknown>;
}

interface FilaIntentoBloqueado {
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
  recorrido: Record<string, unknown>;
  contenido: Record<string, unknown>;
}

@Injectable()
export class AttemptsFinalizationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly scoringService: ScoringService,
    private readonly gamificationService: GamificationService,
    private readonly auditService: AuditService,
  ) {}

  async finalizarIntento(
    usuarioId: number,
    intentoId: string,
    dto: FinalizarIntentoDto,
    cuerpoCrudo?: Record<string, unknown>,
  ): Promise<ResultadoFinalizacionIntento> {
    if (cuerpoCrudo && 'puntuacion' in cuerpoCrudo) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'PUNTUACION_CLIENTE_PROHIBIDA',
        'La puntuación se calcula exclusivamente en el servidor',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      // Orden fijo de bloqueos (01 §6): 1) usuario -> 2) intento
      await queryRunner.query(
        `SELECT id FROM usuario WHERE id = $1 AND activo = TRUE FOR UPDATE`,
        [usuarioId],
      );

      const filas = (await queryRunner.query(
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
           i.recorrido,
           vu.contenido
         FROM intento i
         INNER JOIN unidad u ON u.id = i.unidad_id
         INNER JOIN version_unidad vu
           ON vu.id = i.version_id
          AND vu.unidad_id = i.unidad_id
         WHERE i.id = $1
           AND i.usuario_id = $2
         FOR UPDATE OF i`,
        [intentoId, usuarioId],
      )) as FilaIntentoBloqueado[];

      const intento = filas[0];
      if (!intento) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'INTENTO_NO_ENCONTRADO',
          'Intento no encontrado',
        );
      }

      if (intento.estado === 'finalizado' && intento.finalizacion !== null) {
        const creditosExistentes = (await queryRunner.query(
          `SELECT puntos
           FROM credito_unidad
           WHERE usuario_id = $1
             AND unidad_id = $2
             AND intento_origen_id = $3
           LIMIT 1`,
          [usuarioId, intento.unidad_id, intento.id],
        )) as Array<{ puntos: number }>;

        const insigniasExistentes = (await queryRunner.query(
          `SELECT
             ui.insignia_id,
             ins.codigo,
             ins.nombre,
             ui.obtenida_en,
             ui.intento_origen_id
           FROM usuario_insignia ui
           INNER JOIN insignia ins ON ins.id = ui.insignia_id
           WHERE ui.usuario_id = $1
             AND ui.intento_origen_id = $2
           ORDER BY ui.insignia_id ASC`,
          [usuarioId, intento.id],
        )) as InsigniaConcedida[];

        await queryRunner.commitTransaction();

        return {
          id: intento.id,
          unidad_id: intento.unidad_id,
          version_id: Number(intento.version_id),
          version_numero: intento.version_numero,
          tipo: intento.tipo,
          titulo: intento.titulo,
          numero: intento.numero,
          estado: 'finalizado',
          inicio: intento.inicio,
          finalizacion: intento.finalizacion,
          puntuacion:
            intento.puntuacion !== null ? Number(intento.puntuacion) : null,
          revision: intento.revision,
          credito_otorgado: creditosExistentes.length > 0,
          puntos_acreditados: creditosExistentes[0]?.puntos ?? 0,
          insignias_concedidas: insigniasExistentes,
          retroalimentacion:
            this.scoringService.construirRetroalimentacionHistorica(
              intento.tipo,
              intento.contenido,
              intento.recorrido,
            ),
        };
      }

      if (dto.revision !== undefined && dto.revision !== intento.revision) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'REVISION_DESACTUALIZADA',
          'La revisión del intento está desactualizada',
          { revisionActual: intento.revision },
        );
      }

      const evaluacion = this.scoringService.evaluarFinalizacion({
        tipo: intento.tipo,
        contenido: intento.contenido,
        recorridoActual: intento.recorrido,
        payloadFinal: dto,
      });

      const resultadoUpdate = (await queryRunner.query(
        `UPDATE intento
         SET estado = 'finalizado',
             finalizacion = GREATEST(CURRENT_TIMESTAMP, inicio),
             puntuacion = $1,
             recorrido = $2::jsonb,
             revision = revision + 1
         WHERE id = $3
           AND usuario_id = $4
           AND estado = 'en_curso'
           AND revision = $5
         RETURNING id, finalizacion, puntuacion, revision`,
        [
          evaluacion.puntuacion,
          JSON.stringify(evaluacion.recorridoFinal),
          intentoId,
          usuarioId,
          intento.revision,
        ],
      )) as unknown;

      const actualizados = extraerFilasMutacion<{
        id: string;
        finalizacion: Date;
        puntuacion: string | null;
        revision: number;
      }>(resultadoUpdate);

      const confirmado = actualizados[0];
      if (!confirmado) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'REVISION_DESACTUALIZADA',
          'No fue posible confirmar el intento por conflicto de estado o revisión',
        );
      }

      const creditosInsertados = (await queryRunner.query(
        `INSERT INTO credito_unidad (
           usuario_id,
           unidad_id,
           intento_origen_id,
           puntos,
           completada_en
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (usuario_id, unidad_id) DO NOTHING
         RETURNING puntos`,
        [
          usuarioId,
          intento.unidad_id,
          intentoId,
          evaluacion.puntosUnidad,
          confirmado.finalizacion,
        ],
      )) as Array<{ puntos: number }>;

      const insigniasConcedidas =
        await this.gamificationService.evaluarYConcederInsigniasEnTx(
          queryRunner.manager,
          { usuarioId, intentoId },
        );

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuarioId,
        origenActor: 'usuario',
        accion: 'finalizar_intento',
        recursoTipo: 'intento',
        recursoId: intentoId,
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: intento.id,
        unidad_id: intento.unidad_id,
        version_id: Number(intento.version_id),
        version_numero: intento.version_numero,
        tipo: intento.tipo,
        titulo: intento.titulo,
        numero: intento.numero,
        estado: 'finalizado',
        inicio: intento.inicio,
        finalizacion: confirmado.finalizacion,
        puntuacion:
          confirmado.puntuacion !== null ? Number(confirmado.puntuacion) : null,
        revision: confirmado.revision,
        credito_otorgado: creditosInsertados.length > 0,
        puntos_acreditados: creditosInsertados[0]?.puntos ?? 0,
        insignias_concedidas: insigniasConcedidas,
        retroalimentacion:
          this.scoringService.construirRetroalimentacionHistorica(
            intento.tipo,
            intento.contenido,
            evaluacion.recorridoFinal,
          ),
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
