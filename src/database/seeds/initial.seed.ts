import type { DataSource } from 'typeorm';

/**
 * Ejecuta los seeds iniciales idempotentes del catalogo base:
 * - Los 3 roles fijos de aplicacion: APRENDIZ, ADMIN_CONTENIDO, ADMIN_TECNICO.
 * - La fila unica de guarda_integridad: 'admin_tecnico_activo'.
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
}
