import type { DataSource } from 'typeorm';
import { EditorialDraftService } from '../../modules/catalog/editorial-draft.service.js';
import { EditorialPublishService } from '../../modules/catalog/editorial-publish.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import { ContentValidatorService } from '../../shared/validation/content-validator.service.js';
import { LECCIONES_SEED } from './content-lessons.data.js';
import {
  resolverRevisorEditorial,
  sembrarTemasYFuentesBase,
  sincronizarRutasSeed,
  verificarPermisoEjecucionSeed,
} from './content-seed-guard.js';
import { runInitialSeeds } from './initial.seed.js';

export interface ResumenEjecucionSeedContenido {
  revisorId: number;
  revisorCreado: boolean;
  temasTotal: number;
  fuentesVersionTotal: number;
  unidadesPublicadasNuevas: number;
  unidadesOmitidasYaPublicadas: number;
  rutasSincronizadas: number;
}

/**
 * Ejecuta de forma idempotente el seed de contenido sintético de ejemplo
 * para desarrollo y pruebas:
 * - Se niega a correr en NODE_ENV=production (salvo SEED_ALLOW_PRODUCTION=true).
 * - Siembra 3 temas, ediciones de fuentes con URLs públicas reales y 2 rutas (General y TI).
 * - Crea y publica 8 unidades (3 Aprende, 3 NormaMatch, 2 CasoTech) pasando por
 *   el flujo editorial completo (borrador -> revisión aprobada con huella SHA-256 -> publicar)
 *   y por ContentValidatorService.
 */
export async function runContentSeed(
  dataSource: DataSource,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResumenEjecucionSeedContenido> {
  verificarPermisoEjecucionSeed(env);

  await runInitialSeeds(dataSource);

  const { revisorId, creado: revisorCreado } = await resolverRevisorEditorial(
    dataSource,
    env,
  );

  const { temasPorClave, fuentesVersionPorClave } =
    await sembrarTemasYFuentesBase(dataSource);

  const contentValidator = new ContentValidatorService();
  const auditService = new AuditService(dataSource);
  const editorialDraftService = new EditorialDraftService(
    dataSource,
    contentValidator,
    auditService,
  );
  const editorialPublishService = new EditorialPublishService(
    dataSource,
    contentValidator,
    auditService,
  );

  const unidadesPorTitulo = new Map<string, number>();
  let unidadesPublicadasNuevas = 0;
  let unidadesOmitidasYaPublicadas = 0;

  for (const leccion of LECCIONES_SEED) {
    const temaId = temasPorClave.get(leccion.temaClave);
    if (temaId === undefined) {
      throw new Error(
        `Tema "${leccion.temaClave}" no resuelto durante el seed de "${leccion.titulo}".`,
      );
    }

    const fuentesDto = leccion.citas.map((cita) => {
      const fuenteVersionId = fuentesVersionPorClave.get(cita.fuenteClave);
      if (fuenteVersionId === undefined) {
        throw new Error(
          `Fuente "${cita.fuenteClave}" no resuelta durante el seed de "${leccion.titulo}".`,
        );
      }
      return {
        clave_local: cita.claveLocal,
        fuente_version_id: fuenteVersionId,
        revisada_en: cita.revisadaEn,
      };
    });

    const existentes = (await dataSource.query(
      `SELECT
         vu.id AS version_id,
         vu.unidad_id,
         vu.numero,
         vu.estado,
         u.version_publicada_id,
         u.activa,
         u.muestra_publica
       FROM version_unidad vu
       INNER JOIN unidad u ON u.id = vu.unidad_id
       WHERE LOWER(vu.titulo) = LOWER($1)
         AND vu.numero = 1
       ORDER BY vu.id ASC
       LIMIT 1`,
      [leccion.titulo],
    )) as Array<{
      version_id: string | number;
      unidad_id: number;
      numero: number;
      estado: string;
      version_publicada_id: string | number | null;
      activa: boolean;
      muestra_publica: boolean;
    }>;

    if (existentes.length > 0) {
      const actual = existentes[0];
      const versionId = Number(actual.version_id);
      const unidadId = Number(actual.unidad_id);

      if (
        actual.estado === 'publicado' &&
        Number(actual.version_publicada_id) === versionId
      ) {
        if (!actual.activa || actual.muestra_publica !== leccion.muestraPublica) {
          await dataSource.query(
            `UPDATE unidad
             SET activa = TRUE,
                 muestra_publica = $1
             WHERE id = $2`,
            [leccion.muestraPublica, unidadId],
          );
        }
        unidadesPorTitulo.set(leccion.titulo.toLowerCase(), unidadId);
        unidadesOmitidasYaPublicadas += 1;
        continue;
      }

      if (actual.estado === 'borrador' || actual.estado === 'en_revision') {
        await editorialDraftService.actualizarVersionBorrador(
          revisorId,
          versionId,
          {
            titulo: leccion.titulo,
            descripcion: leccion.descripcion,
            tema_id: temaId,
            dificultad: leccion.dificultad,
            esquema_version: 1,
            contenido: leccion.contenido,
            fuentes: fuentesDto,
          },
        );
        await editorialDraftService.registrarRevisionEditorial(
          revisorId,
          versionId,
          {
            resultado: 'aprobada',
          },
        );
        await editorialPublishService.publicarVersion(revisorId, versionId);
        unidadesPorTitulo.set(leccion.titulo.toLowerCase(), unidadId);
        unidadesPublicadasNuevas += 1;
        continue;
      }
    }

    const nuevaUnidad = await editorialDraftService.crearUnidad(revisorId, {
      tipo: leccion.tipo,
      muestra_publica: leccion.muestraPublica,
    });

    const nuevoBorrador = await editorialDraftService.crearVersionBorrador(
      revisorId,
      {
        unidad_id: nuevaUnidad.id,
        titulo: leccion.titulo,
        descripcion: leccion.descripcion,
        tema_id: temaId,
        dificultad: leccion.dificultad,
        esquema_version: 1,
        contenido: leccion.contenido,
        fuentes: fuentesDto,
      },
    );

    await editorialDraftService.registrarRevisionEditorial(
      revisorId,
      nuevoBorrador.id,
      {
        resultado: 'aprobada',
      },
    );

    await editorialPublishService.publicarVersion(revisorId, nuevoBorrador.id);

    unidadesPorTitulo.set(leccion.titulo.toLowerCase(), nuevaUnidad.id);
    unidadesPublicadasNuevas += 1;
  }

  const rutasMap = await sincronizarRutasSeed(dataSource, unidadesPorTitulo);

  return {
    revisorId,
    revisorCreado,
    temasTotal: temasPorClave.size,
    fuentesVersionTotal: fuentesVersionPorClave.size,
    unidadesPublicadasNuevas,
    unidadesOmitidasYaPublicadas,
    rutasSincronizadas: rutasMap.size,
  };
}
