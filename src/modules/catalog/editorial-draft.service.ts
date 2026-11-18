import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { DomainError } from '../../common/errors/domain.error.js';
import {
  calcularHuellaEditorial,
  type ReferenciaEditorialHuella,
} from '../../common/utils/huella-editorial.js';
import { extraerFilasMutacion } from '../../common/utils/typeorm-result.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import {
  ContentValidatorService,
  type TipoUnidad,
} from '../../shared/validation/content-validator.service.js';
import type { ActualizarVersionEditorialDto } from './dto/actualizar-version-editorial.dto.js';
import type { DificultadUnidad } from './dto/consultar-catalogo.dto.js';
import type { CrearRevisionEditorialDto } from './dto/crear-revision-editorial.dto.js';
import type { CrearUnidadEditorialDto } from './dto/crear-unidad-editorial.dto.js';
import type {
  CrearVersionEditorialDto,
  FuenteCitaEditorialDto,
} from './dto/crear-version-editorial.dto.js';

const MAX_CONTENIDO_BYTES = 1_048_576; // 1 MiB

export type EstadoVersionEditorial =
  | 'borrador'
  | 'en_revision'
  | 'publicado'
  | 'desactivado';

export interface UnidadEditorialResultado {
  id: number;
  tipo: TipoUnidad;
  activa: boolean;
  muestra_publica: boolean;
  version_publicada_id: number | null;
}

export interface VersionEditorialResultado {
  id: number;
  unidad_id: number;
  numero: number;
  titulo: string;
  descripcion: string;
  tema_id: number;
  dificultad: DificultadUnidad;
  estado: EstadoVersionEditorial;
  esquema_version: number;
  contenido: Record<string, unknown>;
  revision: number;
  creada_en: Date;
  publicada_en: Date | null;
  fuentes: ReferenciaEditorialHuella[];
  huella_actual: string;
}

export interface RevisionEditorialResultado {
  id: number;
  version_id: number;
  revisor_id: number;
  huella_revisada: string;
  fecha: Date;
  resultado: 'aprobada' | 'rechazada' | 'observaciones';
}

interface FilaUnidadEditorial {
  id: number;
  tipo: TipoUnidad;
  activa: boolean;
  muestra_publica: boolean;
  version_publicada_id: string | number | null;
}

export interface FilaVersionEditorial {
  id: string | number;
  unidad_id: number;
  numero: number;
  titulo: string;
  descripcion: string;
  tema_id: number;
  dificultad: DificultadUnidad;
  estado: EstadoVersionEditorial;
  esquema_version: number;
  contenido: Record<string, unknown>;
  revision: number;
  creada_en: Date;
  publicada_en: Date | null;
}

interface FilaRevisionEditorial {
  id: string | number;
  version_id: string | number;
  revisor_id: number;
  huella_revisada: string;
  fecha: Date;
  resultado: 'aprobada' | 'rechazada' | 'observaciones';
}

export async function cargarReferenciasVersionEditorial(
  em: EntityManager,
  versionId: number,
): Promise<ReferenciaEditorialHuella[]> {
  const filas = (await em.query(
    `SELECT
       clave_local,
       fuente_version_id,
       TO_CHAR(revisada_en, 'YYYY-MM-DD') AS revisada_en
     FROM unidad_fuente
     WHERE version_id = $1
     ORDER BY clave_local ASC`,
    [versionId],
  )) as Array<{
    clave_local: string;
    fuente_version_id: string | number;
    revisada_en: string;
  }>;

  return filas.map((fila) => ({
    clave_local: fila.clave_local,
    fuente_version_id: Number(fila.fuente_version_id),
    revisada_en: fila.revisada_en.slice(0, 10),
  }));
}

function verificarTamanoContenido(contenido: Record<string, unknown>): void {
  const bytes = Buffer.byteLength(JSON.stringify(contenido), 'utf8');
  if (bytes > MAX_CONTENIDO_BYTES) {
    throw new DomainError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'CONTENIDO_EXCEDE_LIMITE',
      'El contenido supera el tamaño máximo permitido de 1 MiB',
      { bytes, maximoBytes: MAX_CONTENIDO_BYTES },
    );
  }
}

function normalizarFuentesEntrada(
  fuentes?: FuenteCitaEditorialDto[],
): ReferenciaEditorialHuella[] {
  if (!fuentes || fuentes.length === 0) {
    return [];
  }

  const claves = new Set<string>();
  const normalizadas: ReferenciaEditorialHuella[] = [];

  for (const fuente of fuentes) {
    const clave = fuente.clave_local.trim();
    if (claves.has(clave)) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CLAVE_FUENTE_DUPLICADA',
        `La clave_local "${clave}" está duplicada en las fuentes de la versión`,
      );
    }
    claves.add(clave);

    const fecha = new Date(fuente.revisada_en);
    if (Number.isNaN(fecha.getTime())) {
      throw new DomainError(
        HttpStatus.BAD_REQUEST,
        'FECHA_REVISION_FUENTE_INVALIDA',
        `La fecha revisada_en de "${clave}" no es válida`,
      );
    }

    normalizadas.push({
      clave_local: clave,
      fuente_version_id: fuente.fuente_version_id,
      revisada_en: fecha.toISOString().slice(0, 10),
    });
  }

  return normalizadas;
}

@Injectable()
export class EditorialDraftService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly contentValidator: ContentValidatorService,
    private readonly auditService: AuditService,
  ) {}

  async crearUnidad(
    actorId: number,
    dto: CrearUnidadEditorialDto,
  ): Promise<UnidadEditorialResultado> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const filas = (await queryRunner.query(
        `INSERT INTO unidad (tipo, activa, muestra_publica, version_publicada_id)
         VALUES ($1, TRUE, $2, NULL)
         RETURNING id, tipo, activa, muestra_publica, version_publicada_id`,
        [dto.tipo, dto.muestra_publica ?? false],
      )) as FilaUnidadEditorial[];

      const unidad = filas[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'crear_unidad',
        recursoTipo: 'unidad',
        recursoId: String(unidad.id),
        resultado: 'exitoso',
      });

      await queryRunner.commitTransaction();

      return {
        id: unidad.id,
        tipo: unidad.tipo,
        activa: unidad.activa,
        muestra_publica: unidad.muestra_publica,
        version_publicada_id: null,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async crearVersionBorrador(
    actorId: number,
    dto: CrearVersionEditorialDto,
  ): Promise<VersionEditorialResultado> {
    verificarTamanoContenido(dto.contenido);
    const fuentesNormalizadas = normalizarFuentesEntrada(dto.fuentes);
    const esquemaVersion = dto.esquema_version ?? 1;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const unidades = (await queryRunner.query(
        `SELECT id, tipo, activa, version_publicada_id
         FROM unidad
         WHERE id = $1
         FOR UPDATE`,
        [dto.unidad_id],
      )) as Array<{ id: number }>;

      if (unidades.length === 0) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'UNIDAD_NO_ENCONTRADA',
          'Unidad no encontrada',
        );
      }

      await this.verificarTemaExiste(queryRunner.manager, dto.tema_id);
      await this.verificarFuentesExisten(
        queryRunner.manager,
        fuentesNormalizadas,
      );

      const ordinales = (await queryRunner.query(
        `SELECT COALESCE(MAX(numero), 0)::int + 1 AS siguiente
         FROM version_unidad
         WHERE unidad_id = $1`,
        [dto.unidad_id],
      )) as Array<{ siguiente: number }>;
      const numero = ordinales[0].siguiente;

      // Inserta borrador sin mover unidad.version_publicada_id
      const insertadas = (await queryRunner.query(
        `INSERT INTO version_unidad (
           unidad_id,
           numero,
           titulo,
           descripcion,
           tema_id,
           dificultad,
           estado,
           esquema_version,
           contenido,
           revision,
           publicada_en
         ) VALUES ($1, $2, $3, $4, $5, $6, 'borrador', $7, $8::jsonb, 1, NULL)
         RETURNING id, unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, revision, creada_en, publicada_en`,
        [
          dto.unidad_id,
          numero,
          dto.titulo,
          dto.descripcion,
          dto.tema_id,
          dto.dificultad,
          esquemaVersion,
          JSON.stringify(dto.contenido),
        ],
      )) as FilaVersionEditorial[];

      const version = insertadas[0];
      const versionId = Number(version.id);

      await this.insertarFuentesVersion(
        queryRunner.manager,
        versionId,
        fuentesNormalizadas,
      );

      const referencias = await cargarReferenciasVersionEditorial(
        queryRunner.manager,
        versionId,
      );
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

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'crear_version_borrador',
        recursoTipo: 'version_unidad',
        recursoId: String(versionId),
        resultado: 'exitoso',
        detalleMinimo: `unidad=${version.unidad_id},numero=${version.numero}`,
      });

      await queryRunner.commitTransaction();

      return this.mapearVersionResultado(version, referencias, huellaActual);
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async actualizarVersionBorrador(
    actorId: number,
    versionId: number,
    dto: ActualizarVersionEditorialDto,
  ): Promise<VersionEditorialResultado> {
    if (dto.contenido !== undefined) {
      verificarTamanoContenido(dto.contenido);
    }
    const fuentesNormalizadas =
      dto.fuentes !== undefined
        ? normalizarFuentesEntrada(dto.fuentes)
        : undefined;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const bloqueadas = (await queryRunner.query(
        `SELECT id, unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, revision, creada_en, publicada_en
         FROM version_unidad
         WHERE id = $1
         FOR UPDATE`,
        [versionId],
      )) as FilaVersionEditorial[];

      const actual = bloqueadas[0];
      if (!actual) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'VERSION_NO_ENCONTRADA',
          'Versión editorial no encontrada',
        );
      }

      if (actual.estado === 'publicado' || actual.estado === 'desactivado') {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'VERSION_PUBLICADA_INMUTABLE',
          'No se puede modificar una versión publicada o desactivada; crea una nueva revisión',
        );
      }

      if (
        dto.revision_esperada !== undefined &&
        actual.revision !== dto.revision_esperada
      ) {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'REVISION_DESACTUALIZADA',
          'La versión fue modificada por otro proceso; recarga la revisión actual antes de guardar',
          {
            revision_esperada: dto.revision_esperada,
            revision_actual: actual.revision,
          },
        );
      }

      if (dto.tema_id !== undefined) {
        await this.verificarTemaExiste(queryRunner.manager, dto.tema_id);
      }

      if (fuentesNormalizadas !== undefined) {
        await this.verificarFuentesExisten(
          queryRunner.manager,
          fuentesNormalizadas,
        );
        await queryRunner.query(
          `DELETE FROM unidad_fuente WHERE version_id = $1`,
          [versionId],
        );
        await this.insertarFuentesVersion(
          queryRunner.manager,
          versionId,
          fuentesNormalizadas,
        );
      }

      const resultadoUpdate = await queryRunner.query(
        `UPDATE version_unidad
         SET
           titulo = $1,
           descripcion = $2,
           tema_id = $3,
           dificultad = $4,
           esquema_version = $5,
           contenido = $6::jsonb,
           revision = revision + 1
         WHERE id = $7
         RETURNING id, unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, revision, creada_en, publicada_en`,
        [
          dto.titulo ?? actual.titulo,
          dto.descripcion ?? actual.descripcion,
          dto.tema_id ?? actual.tema_id,
          dto.dificultad ?? actual.dificultad,
          dto.esquema_version ?? actual.esquema_version,
          JSON.stringify(dto.contenido ?? actual.contenido),
          versionId,
        ],
      );
      const actualizada =
        extraerFilasMutacion<FilaVersionEditorial>(resultadoUpdate)[0];

      const referencias = await cargarReferenciasVersionEditorial(
        queryRunner.manager,
        versionId,
      );
      const huellaActual = calcularHuellaEditorial({
        unidad_id: actualizada.unidad_id,
        numero: actualizada.numero,
        titulo: actualizada.titulo,
        descripcion: actualizada.descripcion,
        tema_id: actualizada.tema_id,
        dificultad: actualizada.dificultad,
        esquema_version: actualizada.esquema_version,
        contenido: actualizada.contenido,
        referencias,
      });

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'actualizar_version_borrador',
        recursoTipo: 'version_unidad',
        recursoId: String(versionId),
        resultado: 'exitoso',
        detalleMinimo: `revision=${actualizada.revision}`,
      });

      await queryRunner.commitTransaction();

      return this.mapearVersionResultado(actualizada, referencias, huellaActual);
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async registrarRevisionEditorial(
    actorId: number,
    versionId: number,
    dto: CrearRevisionEditorialDto,
  ): Promise<RevisionEditorialResultado> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      const filas = (await queryRunner.query(
        `SELECT
           vu.id,
           vu.unidad_id,
           vu.numero,
           vu.titulo,
           vu.descripcion,
           vu.tema_id,
           vu.dificultad,
           vu.estado,
           vu.esquema_version,
           vu.contenido,
           vu.revision,
           vu.creada_en,
           vu.publicada_en,
           u.tipo
         FROM version_unidad vu
         INNER JOIN unidad u ON u.id = vu.unidad_id
         WHERE vu.id = $1
         FOR UPDATE OF vu`,
        [versionId],
      )) as Array<FilaVersionEditorial & { tipo: TipoUnidad }>;

      const version = filas[0];
      if (!version) {
        throw new DomainError(
          HttpStatus.NOT_FOUND,
          'VERSION_NO_ENCONTRADA',
          'Versión editorial no encontrada',
        );
      }

      if (version.estado === 'publicado' || version.estado === 'desactivado') {
        throw new DomainError(
          HttpStatus.CONFLICT,
          'TRANSICION_ESTADO_INVALIDA',
          'No se puede registrar revisión editorial sobre una versión publicada o desactivada',
        );
      }

      const referencias = await cargarReferenciasVersionEditorial(
        queryRunner.manager,
        versionId,
      );

      if (dto.resultado === 'aprobada') {
        const clavesFuentesRegistradas = new Set(
          referencias.map((r) => r.clave_local),
        );
        this.contentValidator.validarContenido({
          tipo: version.tipo,
          esquemaVersion: version.esquema_version,
          contenido: version.contenido,
          clavesFuentesRegistradas,
        });
      }

      const huellaRevisada = calcularHuellaEditorial({
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

      if (version.estado === 'borrador') {
        await queryRunner.query(
          `UPDATE version_unidad
           SET estado = 'en_revision'
           WHERE id = $1`,
          [versionId],
        );
      }

      const insertadas = (await queryRunner.query(
        `INSERT INTO revision_editorial (
           version_id,
           revisor_id,
           huella_revisada,
           resultado
         ) VALUES ($1, $2, $3, $4)
         RETURNING id, version_id, revisor_id, huella_revisada, fecha, resultado`,
        [versionId, actorId, huellaRevisada, dto.resultado],
      )) as FilaRevisionEditorial[];

      const revision = insertadas[0];

      await this.auditService.registrar(queryRunner.manager, {
        actorId,
        origenActor: 'usuario',
        accion: 'registrar_revision_editorial',
        recursoTipo: 'revision_editorial',
        recursoId: String(revision.id),
        resultado: 'exitoso',
        detalleMinimo: `version=${versionId},resultado=${dto.resultado}`,
      });

      await queryRunner.commitTransaction();

      return {
        id: Number(revision.id),
        version_id: Number(revision.version_id),
        revisor_id: revision.revisor_id,
        huella_revisada: revision.huella_revisada.trim(),
        fecha: revision.fecha,
        resultado: revision.resultado,
      };
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async verificarTemaExiste(
    em: EntityManager,
    temaId: number,
  ): Promise<void> {
    const temas = (await em.query(
      `SELECT id FROM tema WHERE id = $1 LIMIT 1`,
      [temaId],
    )) as Array<{ id: number }>;

    if (temas.length === 0) {
      throw new DomainError(
        HttpStatus.NOT_FOUND,
        'TEMA_NO_ENCONTRADO',
        'Tema no encontrado',
      );
    }
  }

  private async verificarFuentesExisten(
    em: EntityManager,
    fuentes: ReferenciaEditorialHuella[],
  ): Promise<void> {
    if (fuentes.length === 0) {
      return;
    }
    const idsUnicos = [...new Set(fuentes.map((f) => f.fuente_version_id))];
    const existentes = (await em.query(
      `SELECT id FROM fuente_version WHERE id = ANY($1::bigint[])`,
      [idsUnicos],
    )) as Array<{ id: string | number }>;

    const setExistentes = new Set(existentes.map((row) => Number(row.id)));
    for (const id of idsUnicos) {
      if (!setExistentes.has(id)) {
        throw new DomainError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'FUENTE_VERSION_INEXISTENTE',
          `La edición de fuente ${id} no existe en fuente_version`,
          { fuente_version_id: id },
        );
      }
    }
  }

  private async insertarFuentesVersion(
    em: EntityManager,
    versionId: number,
    fuentes: ReferenciaEditorialHuella[],
  ): Promise<void> {
    for (const fuente of fuentes) {
      await em.query(
        `INSERT INTO unidad_fuente (version_id, clave_local, fuente_version_id, revisada_en)
         VALUES ($1, $2, $3, $4::date)`,
        [
          versionId,
          fuente.clave_local,
          fuente.fuente_version_id,
          fuente.revisada_en,
        ],
      );
    }
  }

  private mapearVersionResultado(
    version: FilaVersionEditorial,
    fuentes: ReferenciaEditorialHuella[],
    huellaActual: string,
  ): VersionEditorialResultado {
    return {
      id: Number(version.id),
      unidad_id: version.unidad_id,
      numero: version.numero,
      titulo: version.titulo,
      descripcion: version.descripcion,
      tema_id: version.tema_id,
      dificultad: version.dificultad,
      estado: version.estado,
      esquema_version: version.esquema_version,
      contenido: version.contenido,
      revision: version.revision,
      creada_en: version.creada_en,
      publicada_en: version.publicada_en,
      fuentes,
      huella_actual: huellaActual,
    };
  }
}
