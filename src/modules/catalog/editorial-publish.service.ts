import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import { calcularHuellaEditorial } from '../../common/utils/huella-editorial.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import {
  ContentValidatorService,
  type TipoUnidad,
} from '../../shared/validation/content-validator.service.js';
import {
  cargarReferenciasVersionEditorial,
  type FilaVersionEditorial,
  type UnidadEditorialResultado,
} from './editorial-draft.service.js';

export interface PublicacionVersionResultado {
  version_id: number;
  unidad_id: number;
  numero: number;
  estado: 'publicado';
  publicada_en: Date;
  version_publicada_id: number;
  huella_publicada: string;
}

interface FilaRevisionAprobacion {
  id: string | number;
  revisor_id: number;
  huella_revisada: string;
  fecha: Date;
  resultado: 'aprobada' | 'rechazada' | 'observaciones';
}

interface FilaUnidadBloqueada {
  id: number;
  tipo: TipoUnidad;
  activa: boolean;
  muestra_publica: boolean;
  version_publicada_id: string | number | null;
}

@Injectable()
export class EditorialPublishService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contentValidator: ContentValidatorService,
    private readonly auditService: AuditService,
  ) {}

  async publicarVersion(
    actorId: number,
    versionId: number,
  ): Promise<PublicacionVersionResultado> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const versiones = (await queryRunner.query(
        `SELECT id, unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, revision, creada_en, publicada_en
         FROM version_unidad
         WHERE id = $1
         FOR UPDATE`,
        [versionId],
      )) as FilaVersionEditorial[];

      const version = versiones[0];
      if (!version) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'VERSION_NO_ENCONTRADA',
          'Versión editorial no encontrada',
        );
      }

      const unidades = (await queryRunner.query(
        `SELECT id, tipo, activa, muestra_publica, version_publicada_id
         FROM unidad
         WHERE id = $1
         FOR UPDATE`,
        [version.unidad_id],
      )) as FilaUnidadBloqueada[];

      const unidad = unidades[0];
      if (!unidad) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'UNIDAD_NO_ENCONTRADA',
          'Unidad no encontrada',
        );
      }

      if (version.estado === 'publicado') {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'VERSION_YA_PUBLICADA',
          'La versión indicada ya se encuentra publicada',
        );
      }

      if (version.estado === 'desactivado') {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'TRANSICION_ESTADO_INVALIDA',
          'No se puede publicar una versión desactivada',
        );
      }

      const referencias = await cargarReferenciasVersionEditorial(
        queryRunner.manager,
        versionId,
      );
      const clavesFuentesRegistradas = new Set(
        referencias.map((r) => r.clave_local),
      );

      this.contentValidator.validarContenido({
        tipo: unidad.tipo,
        esquemaVersion: version.esquema_version,
        contenido: version.contenido,
        clavesFuentesRegistradas,
      });

      const huellaActual = calcularHuellaEditorial({
        unidad_id: version.unidad_id,
        numero: version.numero,
        titulo: version.titulo,
        descripcion: version.descripcion,
        tema_id: version.tema_id,
        dificultad: version.dificultad,
        esquema_version: version.esquema_version,
        contenido: version.contenido,
        referencias,
      });

      const revisiones = (await queryRunner.query(
        `SELECT id, revisor_id, huella_revisada, fecha, resultado
         FROM revision_editorial
         WHERE version_id = $1
         ORDER BY fecha DESC, id DESC
         LIMIT 1`,
        [versionId],
      )) as FilaRevisionAprobacion[];

      const ultimaRevision = revisiones[0];
      if (!ultimaRevision || ultimaRevision.resultado !== 'aprobada') {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'REVISION_APROBADA_REQUERIDA',
          'Para publicar se requiere una revisión editorial aprobada vigente',
        );
      }

      const huellaRevisada = ultimaRevision.huella_revisada
        .trim()
        .toLowerCase();
      if (huellaRevisada !== huellaActual.toLowerCase()) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'HUELLA_EDITORIAL_DESACTUALIZADA',
          'El contenido, metadatos o fuentes cambiaron después de la revisión aprobada',
          {
            huella_revisada: huellaRevisada,
            huella_actual: huellaActual,
          },
        );
      }

      // Publicacion atomica: version publicada anterior permanece intacta como 'publicado'
      const resultadoPublicacion = await queryRunner.query(
        `UPDATE version_unidad
         SET estado = 'publicado',
             publicada_en = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, publicada_en`,
        [versionId],
      );
      const filaPublicada = extraerFilasMutacion<{
        id: string | number;
        publicada_en: Date;
      }>(resultadoPublicacion)[0];

      await queryRunner.query(
        `UPDATE unidad
         SET version_publicada_id = $1
         WHERE id = $2`,
        [versionId, unidad.id],
      );

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'publicar_version',
        recursoTipo: 'version_unidad',
        recursoId: String(versionId),
        resultado: 'exitoso',
        detalleMinimo: `unidad=${unidad.id},numero=${version.numero}`,
      });

      await queryRunner.commitTransaction();

      return {
        version_id: Number(filaPublicada.id),
        unidad_id: unidad.id,
        numero: version.numero,
        estado: 'publicado',
        publicada_en: filaPublicada.publicada_en,
        version_publicada_id: Number(filaPublicada.id),
        huella_publicada: huellaActual,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async desactivarUnidad(
    actorId: number,
    unidadId: number,
  ): Promise<UnidadEditorialResultado> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const unidades = (await queryRunner.query(
        `SELECT id, tipo, activa, muestra_publica, version_publicada_id
         FROM unidad
         WHERE id = $1
         FOR UPDATE`,
        [unidadId],
      )) as FilaUnidadBloqueada[];

      if (unidades.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'UNIDAD_NO_ENCONTRADA',
          'Unidad no encontrada',
        );
      }

      const resultadoUpdate = await queryRunner.query(
        `UPDATE unidad
         SET activa = FALSE
         WHERE id = $1
         RETURNING id, tipo, activa, muestra_publica, version_publicada_id`,
        [unidadId],
      );
      const actualizada =
        extraerFilasMutacion<FilaUnidadBloqueada>(resultadoUpdate)[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'desactivar_unidad',
        recursoTipo: 'unidad',
        recursoId: String(unidadId),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: actualizada.id,
        tipo: actualizada.tipo,
        activa: actualizada.activa,
        muestra_publica: actualizada.muestra_publica,
        version_publicada_id:
          actualizada.version_publicada_id !== null
            ? Number(actualizada.version_publicada_id)
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
