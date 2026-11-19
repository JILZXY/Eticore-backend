import type { DataSource } from 'typeorm';
import {
  derivarArgon2id,
  validarPoliticaContrasena,
} from '../../common/utils/hashing.js';
import { normalizarCorreo } from '../../common/utils/normalizacion-correo.js';
import {
  FUENTES_SEED,
  MARCA_CONTENIDO_SEED,
  RUTAS_SEED,
  TEMAS_SEED,
  type ClaveFuenteVersionSeed,
  type ClaveTemaSeed,
} from './content-catalog.data.js';

export interface RevisorSeedResuelto {
  revisorId: number;
  creado: boolean;
}

export interface ResumenLimpiezaSeed {
  unidadesEliminadas: number;
  unidadesConservadasConHistorial: number;
  temasEliminados: number;
  fuentesVersionEliminadas: number;
  rutasEliminadas: number;
}

/**
 * Impide que el seed o la limpieza de contenido de ejemplo se ejecuten en
 * NODE_ENV=production salvo que exista SEED_ALLOW_PRODUCTION=true explícito.
 */
export function verificarPermisoEjecucionSeed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const nodeEnv = (env.NODE_ENV ?? '').trim().toLowerCase();
  const allowProd = (env.SEED_ALLOW_PRODUCTION ?? '').trim().toLowerCase();

  if (nodeEnv === 'production' && allowProd !== 'true') {
    throw new Error(
      'SEED_PRODUCCION_PROHIBIDO: El seed de contenido de ejemplo está prohibido cuando NODE_ENV=production.',
    );
  }
}

/**
 * Resuelve el usuario ADMIN_CONTENIDO que firmará las revisiones y
 * publicaciones del seed:
 * 1. Si SEED_REVISOR_ID está definido, usa ese usuario existente (sin crear cuentas).
 * 2. Si ya existe algún usuario activo con rol ADMIN_CONTENIDO, lo reutiliza.
 * 3. Solo si no existe ningún ADMIN_CONTENIDO, crea UNA cuenta sintética de
 *    editor tomando la contraseña desde SEED_EDITOR_PASSWORD y el correo desde
 *    SEED_EDITOR_EMAIL (o derivado de ETICORE_API_DOMAIN).
 */
export async function resolverRevisorEditorial(
  dataSource: DataSource,
  env: NodeJS.ProcessEnv = process.env,
): Promise<RevisorSeedResuelto> {
  const rawRevisorId = env.SEED_REVISOR_ID?.trim();
  if (rawRevisorId) {
    const parsedId = Number.parseInt(rawRevisorId, 10);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      throw new Error(
        'SEED_REVISOR_INVALIDO: SEED_REVISOR_ID debe ser un entero positivo.',
      );
    }

    const filas = (await dataSource.query(
      `SELECT id, activo FROM usuario WHERE id = $1 LIMIT 1`,
      [parsedId],
    )) as Array<{ id: number; activo: boolean }>;

    const usuario = filas[0];
    if (!usuario || !usuario.activo) {
      throw new Error(
        `SEED_REVISOR_INVALIDO: El usuario SEED_REVISOR_ID=${parsedId} no existe o está inactivo.`,
      );
    }

    return { revisorId: Number(usuario.id), creado: false };
  }

  const editoresExistentes = (await dataSource.query(
    `SELECT u.id
     FROM usuario u
     INNER JOIN usuario_rol ur ON ur.usuario_id = u.id
     INNER JOIN rol r ON r.id = ur.rol_id
     WHERE r.codigo = 'ADMIN_CONTENIDO'
       AND u.activo = TRUE
     ORDER BY u.id ASC
     LIMIT 1`,
  )) as Array<{ id: number }>;

  if (editoresExistentes.length > 0) {
    return {
      revisorId: Number(editoresExistentes[0].id),
      creado: false,
    };
  }

  const passwordRaw = env.SEED_EDITOR_PASSWORD ?? '';
  if (passwordRaw.length < 15 || passwordRaw.length > 128) {
    throw new Error(
      'SEED_EDITOR_PASSWORD_REQUERIDA: No existe ningún ADMIN_CONTENIDO activo ni se proporcionó SEED_REVISOR_ID. Define SEED_EDITOR_PASSWORD (15 a 128 caracteres) o SEED_REVISOR_ID.',
    );
  }

  const correoCandidato =
    env.SEED_EDITOR_EMAIL?.trim() ||
    (env.ETICORE_API_DOMAIN?.trim()
      ? `editor.seed@${env.ETICORE_API_DOMAIN.trim()}`
      : '');

  if (!correoCandidato) {
    throw new Error(
      'SEED_EDITOR_EMAIL_REQUERIDO: Define SEED_EDITOR_EMAIL o ETICORE_API_DOMAIN en las variables de entorno para crear la cuenta sintética de editor.',
    );
  }

  const correoNormalizado = normalizarCorreo(correoCandidato);
  validarPoliticaContrasena(passwordRaw, correoNormalizado);
  const hashArgon2id = await derivarArgon2id(passwordRaw);

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction('READ COMMITTED');

  try {
    const existentesCorreo = (await queryRunner.query(
      `SELECT id FROM usuario WHERE correo_normalizado = $1 LIMIT 1`,
      [correoNormalizado],
    )) as Array<{ id: number }>;

    let usuarioId: number;
    let creado = false;

    if (existentesCorreo.length > 0) {
      usuarioId = Number(existentesCorreo[0].id);
      await queryRunner.query(
        `UPDATE usuario SET activo = TRUE WHERE id = $1`,
        [usuarioId],
      );
    } else {
      const insertados = (await queryRunner.query(
        `INSERT INTO usuario (nombre_visualizacion, correo_normalizado, activo)
         VALUES ($1, $2, TRUE)
         RETURNING id`,
        ['Editor Sintético Seed (RN-30)', correoNormalizado],
      )) as Array<{ id: number }>;

      usuarioId = Number(insertados[0].id);
      creado = true;

      await queryRunner.query(
        `INSERT INTO credencial (usuario_id, verificador_argon2id)
         VALUES ($1, $2)
         ON CONFLICT (usuario_id) DO NOTHING`,
        [usuarioId, hashArgon2id],
      );
    }

    await queryRunner.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id)
       SELECT $1, r.id
       FROM rol r
       WHERE r.codigo IN ('APRENDIZ', 'ADMIN_CONTENIDO')
       ON CONFLICT (usuario_id, rol_id) DO NOTHING`,
      [usuarioId],
    );

    await queryRunner.commitTransaction();
    return { revisorId: usuarioId, creado };
  } catch (error: unknown) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

/**
 * Siembra de forma idempotente los 3 temas y las ediciones de fuentes reales.
 */
export async function sembrarTemasYFuentesBase(
  dataSource: DataSource,
): Promise<{
  temasPorClave: Map<ClaveTemaSeed, number>;
  fuentesVersionPorClave: Map<ClaveFuenteVersionSeed, number>;
}> {
  const temasPorClave = new Map<ClaveTemaSeed, number>();

  for (const tema of TEMAS_SEED) {
    const existentes = (await dataSource.query(
      `SELECT id, descripcion, activo
       FROM tema
       WHERE LOWER(nombre) = LOWER($1)
       ORDER BY id ASC
       LIMIT 1`,
      [tema.nombre],
    )) as Array<{ id: number; descripcion: string; activo: boolean }>;

    if (existentes.length > 0) {
      const actual = existentes[0];
      if (actual.descripcion !== tema.descripcion || !actual.activo) {
        await dataSource.query(
          `UPDATE tema
           SET descripcion = $1,
               activo = TRUE
           WHERE id = $2`,
          [tema.descripcion, actual.id],
        );
      }
      temasPorClave.set(tema.clave, Number(actual.id));
    } else {
      const insertados = (await dataSource.query(
        `INSERT INTO tema (nombre, descripcion, activo)
         VALUES ($1, $2, TRUE)
         RETURNING id`,
        [tema.nombre, tema.descripcion],
      )) as Array<{ id: number }>;
      temasPorClave.set(tema.clave, Number(insertados[0].id));
    }
  }

  const fuentesVersionPorClave = new Map<ClaveFuenteVersionSeed, number>();

  for (const fuenteDef of FUENTES_SEED) {
    const fuentesExistentes = (await dataSource.query(
      `SELECT id
       FROM fuente
       WHERE LOWER(nombre) = LOWER($1)
       ORDER BY id ASC
       LIMIT 1`,
      [fuenteDef.nombreFuente],
    )) as Array<{ id: number }>;

    let fuenteId: number;
    if (fuentesExistentes.length > 0) {
      fuenteId = Number(fuentesExistentes[0].id);
    } else {
      const insertadas = (await dataSource.query(
        `INSERT INTO fuente (nombre)
         VALUES ($1)
         RETURNING id`,
        [fuenteDef.nombreFuente],
      )) as Array<{ id: number }>;
      fuenteId = Number(insertadas[0].id);
    }

    const versionesExistentes = (await dataSource.query(
      `SELECT id
       FROM fuente_version
       WHERE fuente_id = $1
         AND LOWER(fecha_o_version) = LOWER($2)
         AND url = $3
       ORDER BY id ASC
       LIMIT 1`,
      [fuenteId, fuenteDef.fechaOVersion, fuenteDef.url],
    )) as Array<{ id: string | number }>;

    let fuenteVersionId: number;
    if (versionesExistentes.length > 0) {
      fuenteVersionId = Number(versionesExistentes[0].id);
    } else {
      const insertadas = (await dataSource.query(
        `INSERT INTO fuente_version (
           fuente_id,
           titulo,
           autor_organismo,
           url,
           fecha_o_version,
           licencia_o_condicion_uso
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          fuenteId,
          fuenteDef.tituloEdicion,
          fuenteDef.autorOrganismo,
          fuenteDef.url,
          fuenteDef.fechaOVersion,
          fuenteDef.licenciaOCondicionUso,
        ],
      )) as Array<{ id: string | number }>;
      fuenteVersionId = Number(insertadas[0].id);
    }

    fuentesVersionPorClave.set(fuenteDef.clave, fuenteVersionId);
  }

  return { temasPorClave, fuentesVersionPorClave };
}

/**
 * Siembra o actualiza de forma idempotente las 2 rutas (General y TI),
 * su versión número 1 y la composición de unidades en ruta_unidad.
 */
export async function sincronizarRutasSeed(
  dataSource: DataSource,
  unidadesPorTitulo: ReadonlyMap<string, number>,
): Promise<Map<string, { rutaId: number; versionRutaId: number }>> {
  const resultado = new Map<string, { rutaId: number; versionRutaId: number }>();

  for (const rutaDef of RUTAS_SEED) {
    const rutasExistentes = (await dataSource.query(
      `SELECT id, version_actual_id
       FROM ruta
       WHERE LOWER(nombre) = LOWER($1)
       ORDER BY id ASC
       LIMIT 1`,
      [rutaDef.nombre],
    )) as Array<{ id: number; version_actual_id: string | number | null }>;

    let rutaId: number;
    if (rutasExistentes.length > 0) {
      rutaId = Number(rutasExistentes[0].id);
    } else {
      const insertadas = (await dataSource.query(
        `INSERT INTO ruta (nombre, activa, version_actual_id)
         VALUES ($1, TRUE, NULL)
         RETURNING id`,
        [rutaDef.nombre],
      )) as Array<{ id: number }>;
      rutaId = Number(insertadas[0].id);
    }

    const versionesExistentes = (await dataSource.query(
      `SELECT id
       FROM version_ruta
       WHERE ruta_id = $1
         AND numero = 1
       LIMIT 1`,
      [rutaId],
    )) as Array<{ id: string | number }>;

    let versionRutaId: number;
    if (versionesExistentes.length > 0) {
      versionRutaId = Number(versionesExistentes[0].id);
    } else {
      const insertadas = (await dataSource.query(
        `INSERT INTO version_ruta (ruta_id, numero, publicada_en)
         VALUES ($1, 1, CURRENT_TIMESTAMP)
         RETURNING id`,
        [rutaId],
      )) as Array<{ id: string | number }>;
      versionRutaId = Number(insertadas[0].id);
    }

    await dataSource.query(
      `UPDATE ruta
       SET activa = TRUE,
           version_actual_id = COALESCE(version_actual_id, $1)
       WHERE id = $2`,
      [versionRutaId, rutaId],
    );

    let orden = 1;
    for (const tituloUnidad of rutaDef.unidadesTitulos) {
      const unidadId = unidadesPorTitulo.get(tituloUnidad.toLowerCase());
      if (unidadId === undefined) {
        continue;
      }

      await dataSource.query(
        `INSERT INTO ruta_unidad (ruta_version_id, unidad_id, orden, obligatoria)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (ruta_version_id, unidad_id)
         DO UPDATE SET orden = EXCLUDED.orden, obligatoria = EXCLUDED.obligatoria`,
        [versionRutaId, unidadId, orden],
      );
      orden += 1;
    }

    resultado.set(rutaDef.nombre, { rutaId, versionRutaId });
  }

  return resultado;
}

/**
 * Limpia ÚNICAMENTE el contenido sintético de ejemplo sembrado por el seed,
 * sin borrar nunca intentos, créditos, auditoría ni cuentas con historial.
 */
export async function limpiarContenidoSeed(
  dataSource: DataSource,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResumenLimpiezaSeed> {
  verificarPermisoEjecucionSeed(env);

  const patronMarca = `%${MARCA_CONTENIDO_SEED}%`;

  const unidadesSeed = (await dataSource.query(
    `SELECT DISTINCT u.id,
       EXISTS (SELECT 1 FROM intento i WHERE i.unidad_id = u.id)
       OR EXISTS (SELECT 1 FROM credito_unidad cu WHERE cu.unidad_id = u.id) AS tiene_historial
     FROM unidad u
     INNER JOIN version_unidad vu ON vu.unidad_id = u.id
     WHERE vu.descripcion LIKE $1`,
    [patronMarca],
  )) as Array<{ id: number; tiene_historial: boolean }>;

  const idsUnidadesEliminables = unidadesSeed
    .filter((u) => !u.tiene_historial)
    .map((u) => Number(u.id));
  const unidadesConservadasConHistorial = unidadesSeed.filter(
    (u) => u.tiene_historial,
  ).length;

  if (idsUnidadesEliminables.length > 0) {
    await dataSource.query(
      `DELETE FROM ruta_unidad WHERE unidad_id = ANY($1::int[])`,
      [idsUnidadesEliminables],
    );

    await dataSource.query(
      `UPDATE unidad
       SET version_publicada_id = NULL
       WHERE id = ANY($1::int[])`,
      [idsUnidadesEliminables],
    );

    await dataSource.query(
      `DELETE FROM version_unidad WHERE unidad_id = ANY($1::int[])`,
      [idsUnidadesEliminables],
    );

    await dataSource.query(
      `DELETE FROM unidad WHERE id = ANY($1::int[])`,
      [idsUnidadesEliminables],
    );
  }

  const nombresRutasSeed = RUTAS_SEED.map((r) => r.nombre);
  const rutasEliminables = (await dataSource.query(
    `SELECT r.id
     FROM ruta r
     WHERE r.nombre = ANY($1::varchar[])
       AND NOT EXISTS (
         SELECT 1
         FROM version_ruta vr
         INNER JOIN inscripcion_ruta ir ON ir.ruta_version_id = vr.id
         WHERE vr.ruta_id = r.id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM version_ruta vr
         INNER JOIN ruta_unidad ru ON ru.ruta_version_id = vr.id
         WHERE vr.ruta_id = r.id
       )
       AND NOT EXISTS (
         SELECT 1
         FROM usuario u
         WHERE u.ruta_preferida_id = r.id
       )`,
    [nombresRutasSeed],
  )) as Array<{ id: number }>;

  const idsRutasEliminables = rutasEliminables.map((r) => Number(r.id));
  if (idsRutasEliminables.length > 0) {
    await dataSource.query(
      `UPDATE ruta
       SET version_actual_id = NULL
       WHERE id = ANY($1::int[])`,
      [idsRutasEliminables],
    );
    await dataSource.query(
      `DELETE FROM version_ruta WHERE ruta_id = ANY($1::int[])`,
      [idsRutasEliminables],
    );
    await dataSource.query(
      `DELETE FROM ruta WHERE id = ANY($1::int[])`,
      [idsRutasEliminables],
    );
  }

  const urlsFuentesSeed = FUENTES_SEED.map((f) => f.url);
  const fuentesVersionEliminadasFilas = (await dataSource.query(
    `DELETE FROM fuente_version fv
     WHERE fv.url = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1
         FROM unidad_fuente uf
         WHERE uf.fuente_version_id = fv.id
       )
     RETURNING fv.id`,
    [urlsFuentesSeed],
  )) as Array<{ id: string | number }>;

  const nombresFuentesSeed = FUENTES_SEED.map((f) => f.nombreFuente);
  await dataSource.query(
    `DELETE FROM fuente f
     WHERE f.nombre = ANY($1::varchar[])
       AND NOT EXISTS (
         SELECT 1
         FROM fuente_version fv
         WHERE fv.fuente_id = f.id
       )`,
    [nombresFuentesSeed],
  );

  const temasEliminadosFilas = (await dataSource.query(
    `DELETE FROM tema t
     WHERE t.descripcion LIKE $1
       AND NOT EXISTS (
         SELECT 1
         FROM version_unidad vu
         WHERE vu.tema_id = t.id
       )
     RETURNING t.id`,
    [patronMarca],
  )) as Array<{ id: number }>;

  return {
    unidadesEliminadas: idsUnidadesEliminables.length,
    unidadesConservadasConHistorial,
    temasEliminados: temasEliminadosFilas.length,
    fuentesVersionEliminadas: fuentesVersionEliminadasFilas.length,
    rutasEliminadas: idsRutasEliminables.length,
  };
}
