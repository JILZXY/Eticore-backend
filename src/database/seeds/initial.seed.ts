import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';

const DOCUMENTOS_LEGALES_SINTETICOS: ReadonlyArray<{
  tipo: 'aviso_privacidad' | 'terminos';
  texto: string;
}> = [
  {
    tipo: 'aviso_privacidad',
    texto:
      '[PROTOTIPO SINTÉTICO RN-30] Aviso de privacidad de ejemplo para entorno académico Eticore. Reemplazar por aviso institucional aprobado antes de recabar datos reales (REQ-LEG-01/02).',
  },
  {
    tipo: 'terminos',
    texto:
      '[PROTOTIPO SINTÉTICO RN-30] Términos y condiciones de uso de ejemplo para entorno académico Eticore. Reemplazar por texto legal institucional antes de producción.',
  },
];

/**
 * Ejecuta los seeds iniciales idempotentes del catalogo base:
 * - Los 3 roles fijos de aplicacion: APRENDIZ, ADMIN_CONTENIDO, ADMIN_TECNICO.
 * - La fila unica de guarda_integridad: 'admin_tecnico_activo'.
 * - Versiones iniciales sinteticas de documentos legales (RN-30).
 *
 * Nota (00 §10, RN-25): NO se siembran insignias porque sus codigos y
 * criterios exactos aun no estan definidos por el equipo.
 */
export async function runInitialSeeds(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    INSERT INTO rol (codigo, nombre) VALUES
      ('APRENDIZ', 'Aprendiz'),
      ('ADMIN_CONTENIDO', 'Administrador de contenido'),
      ('ADMIN_TECNICO', 'Administrador técnico')
    ON CONFLICT (codigo) DO NOTHING;
  `);

  await dataSource.query(`
    INSERT INTO guarda_integridad (clave)
    VALUES ('admin_tecnico_activo')
    ON CONFLICT (clave) DO NOTHING;
  `);

  for (const doc of DOCUMENTOS_LEGALES_SINTETICOS) {
    const existentes = (await dataSource.query(
      `SELECT id FROM documento_legal WHERE tipo = $1 ORDER BY id ASC LIMIT 1`,
      [doc.tipo],
    )) as Array<{ id: number }>;

    let documentoId = existentes[0]?.id;
    if (documentoId === undefined) {
      const insertados = (await dataSource.query(
        `INSERT INTO documento_legal (tipo) VALUES ($1) RETURNING id`,
        [doc.tipo],
      )) as Array<{ id: number }>;
      documentoId = insertados[0].id;
    }

    const huella = createHash('sha256').update(doc.texto, 'utf8').digest('hex');
    await dataSource.query(
      `INSERT INTO version_documento (documento_id, numero, texto, huella)
       VALUES ($1, 1, $2, $3)
       ON CONFLICT (documento_id, numero) DO NOTHING`,
      [documentoId, doc.texto, huella],
    );
  }
}
