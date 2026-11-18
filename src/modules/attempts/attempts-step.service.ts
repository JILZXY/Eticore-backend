import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { TipoUnidad } from '../../shared/validation/content-validator.service.js';
import { ScoringService } from '../../shared/validation/scoring.service.js';
import type { GuardarPasoDto } from './dto/guardar-paso.dto.js';

export interface RespuestaPasoIntento {
  id: string;
  unidad_id: number;
  version_id: number;
  estado: 'en_curso';
  revision: number;
  recorrido: Record<string, unknown>;
}

interface FilaIntentoPaso {
  id: string;
  unidad_id: number;
  version_id: string | number;
  estado: 'en_curso' | 'finalizado';
  revision: number;
  recorrido: Record<string, unknown>;
  tipo: TipoUnidad;
  contenido: Record<string, unknown>;
}

@Injectable()
export class AttemptsStepService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly scoringService: ScoringService,
    private readonly auditService: AuditService,
  ) {}

  async guardarPaso(
    usuarioId: number,
    intentoId: string,
    dto: GuardarPasoDto,
  ): Promise<RespuestaPasoIntento> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const filas = (await queryRunner.query(
        `SELECT
           i.id,
           i.unidad_id,
           i.version_id,
           i.estado,
           i.revision,
           i.recorrido,
           u.tipo,
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
      )) as FilaIntentoPaso[];

      const intento = filas[0];
      if (!intento) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'INTENTO_NO_ENCONTRADO',
          'Intento no encontrado',
        );
      }

      if (intento.estado !== 'en_curso') {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'INTENTO_YA_FINALIZADO',
          'El intento ya fue finalizado y no acepta modificaciones',
        );
      }

      if (dto.revision !== intento.revision) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'REVISION_DESACTUALIZADA',
          'La revisión del intento está desactualizada',
          { revisionActual: intento.revision },
        );
      }

      const nuevoRecorrido = this.scoringService.aplicarPaso({
        tipo: intento.tipo,
        contenido: intento.contenido,
        recorridoActual: intento.recorrido,
        paso: dto,
      });

      const resultadoUpdate = (await queryRunner.query(
        `UPDATE intento
         SET recorrido = $1::jsonb,
             revision = revision + 1
         WHERE id = $2
           AND usuario_id = $3
           AND estado = 'en_curso'
           AND revision = $4
         RETURNING id, unidad_id, version_id, estado, revision, recorrido`,
        [JSON.stringify(nuevoRecorrido), intentoId, usuarioId, dto.revision],
      )) as unknown;

      const actualizados = extraerFilasMutacion<{
        id: string;
        unidad_id: number;
        version_id: string | number;
        estado: 'en_curso';
        revision: number;
        recorrido: Record<string, unknown>;
      }>(resultadoUpdate);

      const actualizado = actualizados[0];
      if (!actualizado) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'REVISION_DESACTUALIZADA',
          'La revisión del intento fue modificada por otra operación',
        );
      }

      await this.auditService.registrar(queryRunner.manager, {
        actorId: usuarioId,
        origenActor: 'usuario',
        accion: 'guardar_paso_intento',
        recursoTipo: 'intento',
        recursoId: intentoId,
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: actualizado.id,
        unidad_id: actualizado.unidad_id,
        version_id: Number(actualizado.version_id),
        estado: actualizado.estado,
        revision: actualizado.revision,
        recorrido: actualizado.recorrido,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
