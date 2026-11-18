import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FuncionesSeguridadAuth2fa1731888000002 implements MigrationInterface {
  public readonly name = 'FuncionesSeguridadAuth2fa1731888000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION obtener_contexto_autenticacion_por_correo(p_correo VARCHAR)
      RETURNS TABLE (
          usuario_id INTEGER,
          nombre_visualizacion VARCHAR,
          correo_normalizado VARCHAR,
          activo BOOLEAN,
          ruta_preferida_id INTEGER,
          creado_en TIMESTAMPTZ,
          verificador_argon2id TEXT,
          tiene_2fa_confirmado BOOLEAN,
          exige_2fa_por_rol BOOLEAN
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
          RETURN QUERY
          SELECT
              u.id,
              u.nombre_visualizacion,
              u.correo_normalizado,
              u.activo,
              u.ruta_preferida_id,
              u.creado_en,
              c.verificador_argon2id,
              (sf.confirmado_en IS NOT NULL),
              EXISTS (
                  SELECT 1
                  FROM usuario_rol ur
                  INNER JOIN rol r ON r.id = ur.rol_id
                  WHERE ur.usuario_id = u.id
                    AND r.codigo IN ('ADMIN_TECNICO', 'ADMIN_CONTENIDO')
              )
          FROM usuario u
          INNER JOIN credencial c ON c.usuario_id = u.id
          LEFT JOIN segundo_factor sf ON sf.usuario_id = u.id
          WHERE u.correo_normalizado = p_correo
          LIMIT 1;
      END;
      $$;

      CREATE OR REPLACE FUNCTION obtener_segundo_factor_para_verificacion(p_usuario_id INTEGER)
      RETURNS TABLE (
          usuario_id INTEGER,
          secreto_cifrado BYTEA,
          algoritmo VARCHAR,
          periodo SMALLINT,
          digitos SMALLINT,
          confirmado_en TIMESTAMPTZ,
          ultimo_paso_totp BIGINT
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
          RETURN QUERY
          SELECT
              sf.usuario_id,
              sf.secreto_cifrado,
              sf.algoritmo,
              sf.periodo,
              sf.digitos,
              sf.confirmado_en,
              sf.ultimo_paso_totp
          FROM segundo_factor sf
          WHERE sf.usuario_id = p_usuario_id
          LIMIT 1;
      END;
      $$;

      CREATE OR REPLACE FUNCTION guardar_segundo_factor_iniciado(
          p_usuario_id INTEGER,
          p_secreto_cifrado BYTEA,
          p_algoritmo VARCHAR,
          p_periodo SMALLINT,
          p_digitos SMALLINT
      )
      RETURNS TABLE (
          usuario_id INTEGER,
          creado_en TIMESTAMPTZ
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
          RETURN QUERY
          INSERT INTO segundo_factor (
              usuario_id,
              secreto_cifrado,
              algoritmo,
              periodo,
              digitos,
              creado_en,
              confirmado_en,
              ultimo_paso_totp
          ) VALUES (
              p_usuario_id,
              p_secreto_cifrado,
              p_algoritmo,
              p_periodo,
              p_digitos,
              CURRENT_TIMESTAMP,
              NULL,
              NULL
          )
          ON CONFLICT ON CONSTRAINT segundo_factor_pkey DO UPDATE
          SET secreto_cifrado = EXCLUDED.secreto_cifrado,
              algoritmo = EXCLUDED.algoritmo,
              periodo = EXCLUDED.periodo,
              digitos = EXCLUDED.digitos,
              creado_en = CURRENT_TIMESTAMP,
              confirmado_en = NULL,
              ultimo_paso_totp = NULL
          WHERE segundo_factor.confirmado_en IS NULL
          RETURNING segundo_factor.usuario_id, segundo_factor.creado_en;
      END;
      $$;

      CREATE OR REPLACE FUNCTION confirmar_segundo_factor(
          p_usuario_id INTEGER,
          p_paso_totp BIGINT
      )
      RETURNS TABLE (
          usuario_id INTEGER,
          confirmado_en TIMESTAMPTZ,
          ultimo_paso_totp BIGINT
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
          RETURN QUERY
          UPDATE segundo_factor sf
          SET confirmado_en = GREATEST(CURRENT_TIMESTAMP, sf.creado_en),
              ultimo_paso_totp = p_paso_totp
          WHERE sf.usuario_id = p_usuario_id
            AND sf.confirmado_en IS NULL
          RETURNING sf.usuario_id, sf.confirmado_en, sf.ultimo_paso_totp;
      END;
      $$;

      CREATE OR REPLACE FUNCTION actualizar_paso_segundo_factor(
          p_usuario_id INTEGER,
          p_paso_totp BIGINT
      )
      RETURNS TABLE (
          usuario_id INTEGER,
          ultimo_paso_totp BIGINT
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
          RETURN QUERY
          UPDATE segundo_factor sf
          SET ultimo_paso_totp = p_paso_totp
          WHERE sf.usuario_id = p_usuario_id
            AND sf.confirmado_en IS NOT NULL
            AND (sf.ultimo_paso_totp IS NULL OR sf.ultimo_paso_totp < p_paso_totp)
          RETURNING sf.usuario_id, sf.ultimo_paso_totp;
      END;
      $$;

      CREATE OR REPLACE FUNCTION eliminar_segundo_factor(p_usuario_id INTEGER)
      RETURNS TABLE (
          usuario_id INTEGER
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      BEGIN
          RETURN QUERY
          DELETE FROM segundo_factor sf
          WHERE sf.usuario_id = p_usuario_id
          RETURNING sf.usuario_id;
      END;
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS eliminar_segundo_factor(INTEGER);
      DROP FUNCTION IF EXISTS actualizar_paso_segundo_factor(INTEGER, BIGINT);
      DROP FUNCTION IF EXISTS confirmar_segundo_factor(INTEGER, BIGINT);
      DROP FUNCTION IF EXISTS guardar_segundo_factor_iniciado(INTEGER, BYTEA, VARCHAR, SMALLINT, SMALLINT);
      DROP FUNCTION IF EXISTS obtener_segundo_factor_para_verificacion(INTEGER);
      DROP FUNCTION IF EXISTS obtener_contexto_autenticacion_por_correo(VARCHAR);
    `);
  }
}
