import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline31Tablas1731888000001 implements MigrationInterface {
  public readonly name = 'Baseline31Tablas1731888000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE rol (
          id       SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          codigo   VARCHAR(32) NOT NULL UNIQUE,
          nombre   VARCHAR(80) NOT NULL
      );

      CREATE TABLE tema (
          id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nombre      VARCHAR(100) NOT NULL,
          descripcion TEXT NOT NULL,
          activo      BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE fuente (
          id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nombre VARCHAR(200) NOT NULL
      );

      CREATE TABLE documento_legal (
          id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tipo VARCHAR(24) NOT NULL
              CHECK (tipo IN ('terminos', 'aviso_privacidad', 'consentimiento'))
      );

      CREATE TABLE insignia (
          id       SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          codigo   VARCHAR(40) NOT NULL UNIQUE,
          nombre   VARCHAR(100) NOT NULL,
          criterio TEXT NOT NULL
      );

      CREATE TABLE grupo (
          id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nombre    VARCHAR(120) NOT NULL,
          periodo   VARCHAR(64) NOT NULL,
          activo    BOOLEAN NOT NULL DEFAULT TRUE,
          creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE usuario (
          id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nombre_visualizacion  VARCHAR(80) NOT NULL
              CHECK (CHAR_LENGTH(nombre_visualizacion) BETWEEN 2 AND 80),
          correo_normalizado    VARCHAR(254) NOT NULL UNIQUE
              CHECK (correo_normalizado = LOWER(correo_normalizado)
                 AND BTRIM(correo_normalizado) = correo_normalizado),
          activo                BOOLEAN NOT NULL DEFAULT TRUE,
          ruta_preferida_id     INTEGER NULL,
          creado_en             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE credencial (
          usuario_id           INTEGER NOT NULL PRIMARY KEY,
          verificador_argon2id TEXT NOT NULL
      );

      CREATE TABLE segundo_factor (
          usuario_id       INTEGER NOT NULL PRIMARY KEY,
          secreto_cifrado  BYTEA NOT NULL,
          algoritmo        VARCHAR(16) NOT NULL DEFAULT 'SHA1'
              CHECK (algoritmo IN ('SHA1', 'SHA256', 'SHA512')),
          periodo          SMALLINT NOT NULL DEFAULT 30
              CHECK (periodo IN (30, 60)),
          digitos          SMALLINT NOT NULL DEFAULT 6
              CHECK (digitos IN (6, 8)),
          creado_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          confirmado_en    TIMESTAMPTZ NULL,
          ultimo_paso_totp BIGINT NULL,
          CHECK (confirmado_en IS NULL OR confirmado_en >= creado_en)
      );

      CREATE TABLE sesion (
          token_hash       BYTEA NOT NULL PRIMARY KEY
              CHECK (LENGTH(token_hash) = 32),
          usuario_id       INTEGER NOT NULL,
          creada_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          ultima_actividad TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
              CHECK (ultima_actividad >= creada_en),
          expira_en        TIMESTAMPTZ NOT NULL
              CHECK (expira_en > creada_en),
          revocada_en      TIMESTAMPTZ NULL,
          verificado_2fa   BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE TABLE desafio_autenticacion (
          id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          usuario_id INTEGER NOT NULL,
          token_hash BYTEA NOT NULL
              CHECK (LENGTH(token_hash) = 32),
          creado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expira_en  TIMESTAMPTZ NOT NULL
              CHECK (expira_en > creado_en),
          intentos   SMALLINT NOT NULL DEFAULT 0
              CHECK (intentos >= 0)
      );

      CREATE TABLE usuario_rol (
          usuario_id  INTEGER NOT NULL,
          rol_id      SMALLINT NOT NULL,
          asignado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (usuario_id, rol_id)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE unidad (
          id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tipo                 VARCHAR(12) NOT NULL
              CHECK (tipo IN ('aprende', 'normamatch', 'casotech')),
          activa               BOOLEAN NOT NULL DEFAULT TRUE,
          muestra_publica      BOOLEAN NOT NULL DEFAULT FALSE,
          version_publicada_id BIGINT NULL
      );

      CREATE TABLE version_unidad (
          id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          unidad_id       INTEGER NOT NULL,
          numero          INTEGER NOT NULL CHECK (numero > 0),
          titulo          VARCHAR(200) NOT NULL,
          descripcion     TEXT NOT NULL,
          tema_id         INTEGER NOT NULL,
          dificultad      VARCHAR(16) NOT NULL
              CHECK (dificultad IN ('basico', 'intermedio', 'especializado')),
          estado          VARCHAR(16) NOT NULL DEFAULT 'borrador'
              CHECK (estado IN ('borrador', 'en_revision', 'publicado', 'desactivado')),
          esquema_version SMALLINT NOT NULL DEFAULT 1 CHECK (esquema_version > 0),
          contenido       JSONB NOT NULL
              CHECK (jsonb_typeof(contenido) = 'object'),
          revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          creada_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          publicada_en    TIMESTAMPTZ NULL,
          UNIQUE (unidad_id, numero),
          UNIQUE (id, unidad_id),
          CHECK (estado <> 'publicado' OR publicada_en IS NOT NULL)
      );

      CREATE TABLE revision_editorial (
          id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          version_id      BIGINT NOT NULL,
          revisor_id      INTEGER NOT NULL,
          huella_revisada CHAR(64) NOT NULL
              CHECK (huella_revisada ~ '^[0-9a-fA-F]{64}$'),
          fecha           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          resultado       VARCHAR(16) NOT NULL
              CHECK (resultado IN ('aprobada', 'rechazada', 'observaciones'))
      );

      CREATE TABLE fuente_version (
          id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          fuente_id                INTEGER NOT NULL,
          titulo                   TEXT NOT NULL,
          autor_organismo          TEXT NOT NULL,
          url                      TEXT NOT NULL,
          fecha_o_version          VARCHAR(120) NOT NULL,
          licencia_o_condicion_uso TEXT NULL
      );

      CREATE TABLE unidad_fuente (
          version_id        BIGINT NOT NULL,
          clave_local       VARCHAR(40) NOT NULL,
          fuente_version_id BIGINT NOT NULL,
          revisada_en       DATE NOT NULL,
          PRIMARY KEY (version_id, clave_local)
      );
    `);

    await queryRunner.query(`
      CREATE TABLE ruta (
          id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          nombre            VARCHAR(80) NOT NULL,
          activa            BOOLEAN NOT NULL DEFAULT TRUE,
          version_actual_id BIGINT NULL
      );

      CREATE TABLE version_ruta (
          id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ruta_id      INTEGER NOT NULL,
          numero       INTEGER NOT NULL CHECK (numero > 0),
          publicada_en TIMESTAMPTZ NULL,
          UNIQUE (ruta_id, numero),
          UNIQUE (id, ruta_id)
      );

      CREATE TABLE ruta_unidad (
          ruta_version_id BIGINT NOT NULL,
          unidad_id       INTEGER NOT NULL,
          orden           INTEGER NOT NULL CHECK (orden > 0),
          obligatoria     BOOLEAN NOT NULL DEFAULT TRUE,
          PRIMARY KEY (ruta_version_id, unidad_id),
          UNIQUE (ruta_version_id, orden)
      );

      CREATE TABLE inscripcion_ruta (
          id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          usuario_id      INTEGER NOT NULL,
          ruta_version_id BIGINT NOT NULL,
          inscrita_en     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          migrada_de_id   BIGINT NULL,
          UNIQUE (usuario_id, ruta_version_id),
          UNIQUE (id, usuario_id),
          CHECK (migrada_de_id IS NULL OR migrada_de_id <> id)
      );

      CREATE TABLE intento (
          id              UUID NOT NULL PRIMARY KEY,
          usuario_id      INTEGER NOT NULL,
          unidad_id       INTEGER NOT NULL,
          version_id      BIGINT NOT NULL,
          numero          INTEGER NOT NULL CHECK (numero > 0),
          estado          VARCHAR(16) NOT NULL DEFAULT 'en_curso'
              CHECK (estado IN ('en_curso', 'finalizado')),
          inicio          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          finalizacion    TIMESTAMPTZ NULL,
          puntuacion      NUMERIC(5,2) NULL
              CHECK (puntuacion IS NULL OR (puntuacion >= 0 AND puntuacion <= 100)),
          revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
          esquema_version SMALLINT NOT NULL DEFAULT 1 CHECK (esquema_version > 0),
          recorrido       JSONB NOT NULL DEFAULT '{}'::jsonb
              CHECK (jsonb_typeof(recorrido) = 'object'),
          UNIQUE (usuario_id, unidad_id, numero),
          UNIQUE (id, usuario_id),
          UNIQUE (id, usuario_id, unidad_id),
          CHECK ((estado = 'finalizado'
                  AND finalizacion IS NOT NULL
                  AND finalizacion >= inicio)
              OR (estado = 'en_curso' AND finalizacion IS NULL))
      );

      CREATE TABLE credito_unidad (
          usuario_id        INTEGER NOT NULL,
          unidad_id         INTEGER NOT NULL,
          intento_origen_id UUID NOT NULL,
          puntos            SMALLINT NOT NULL CHECK (puntos IN (10, 20)),
          completada_en     TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (usuario_id, unidad_id)
      );

      CREATE TABLE usuario_insignia (
          usuario_id            INTEGER NOT NULL,
          insignia_id           SMALLINT NOT NULL,
          obtenida_en           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          intento_origen_id     UUID NULL,
          inscripcion_origen_id BIGINT NULL,
          PRIMARY KEY (usuario_id, insignia_id),
          CHECK ((intento_origen_id IS NOT NULL AND inscripcion_origen_id IS NULL)
              OR (intento_origen_id IS NULL AND inscripcion_origen_id IS NOT NULL))
      );
    `);

    await queryRunner.query(`
      CREATE TABLE membresia_grupo (
          id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          grupo_id   INTEGER NOT NULL,
          usuario_id INTEGER NOT NULL,
          ingreso    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          salida     TIMESTAMPTZ NULL
              CHECK (salida IS NULL OR salida > ingreso),
          UNIQUE (grupo_id, usuario_id, ingreso)
      );

      CREATE TABLE version_documento (
          id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          documento_id INTEGER NOT NULL,
          numero       INTEGER NOT NULL CHECK (numero > 0),
          texto        TEXT NOT NULL,
          huella       CHAR(64) NOT NULL
              CHECK (huella ~ '^[0-9a-fA-F]{64}$'),
          publicada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (documento_id, numero)
      );

      CREATE TABLE evento_legal (
          id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          usuario_id           INTEGER NOT NULL,
          version_documento_id BIGINT NOT NULL,
          finalidad_codigo     VARCHAR(64) NULL,
          tipo_evento          VARCHAR(32) NOT NULL
              CHECK (tipo_evento IN ('aviso_presentado', 'terminos_aceptados',
                                     'consentimiento_otorgado', 'consentimiento_retirado',
                                     'consentimiento_rechazado')),
          fecha_servidor       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          canal                VARCHAR(32) NOT NULL,
          clave_operacion      UUID NOT NULL,
          UNIQUE (usuario_id, clave_operacion)
      );

      CREATE TABLE auditoria (
          id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          actor_id       INTEGER NULL,
          origen_actor   VARCHAR(20) NOT NULL
              CHECK (origen_actor IN ('usuario', 'sistema', 'cuenta_suprimida')),
          fecha_servidor TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          accion         VARCHAR(64) NOT NULL,
          recurso_tipo   VARCHAR(40) NOT NULL,
          recurso_id     TEXT NOT NULL,
          resultado      VARCHAR(16) NOT NULL
              CHECK (resultado IN ('exitoso', 'rechazado', 'fallido')),
          correlacion    UUID NULL,
          detalle_minimo TEXT NULL
      );

      CREATE TABLE auditoria_bd (
          id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          fecha_servidor   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          usuario_bd       VARCHAR(64) NOT NULL,
          operacion        VARCHAR(16) NOT NULL
              CHECK (operacion IN ('INSERT', 'UPDATE', 'DELETE')),
          esquema          VARCHAR(64) NOT NULL DEFAULT 'public',
          tabla            VARCHAR(64) NOT NULL,
          registro_id      TEXT NULL,
          datos_anteriores JSONB NULL,
          datos_nuevos     JSONB NULL,
          aplicacion       VARCHAR(128) NULL,
          direccion_ip     INET NULL
      );

      CREATE TABLE solicitud_privacidad (
          id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          usuario_id          INTEGER NULL,
          tipo                VARCHAR(32) NOT NULL,
          recibida_en         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          estado              VARCHAR(24) NOT NULL
              CHECK (estado IN ('recibida', 'en_revision', 'resuelta')),
          verificacion_minima TEXT NULL,
          resuelta_en         TIMESTAMPTZ NULL
              CHECK (resuelta_en IS NULL OR resuelta_en >= recibida_en),
          resultado           TEXT NULL,
          CHECK (estado <> 'resuelta' OR resuelta_en IS NOT NULL)
      );

      CREATE TABLE guarda_integridad (
          clave VARCHAR(40) NOT NULL PRIMARY KEY
      );
    `);

    await queryRunner.query(`
      ALTER TABLE usuario
          ADD CONSTRAINT fk_usuario_ruta_preferida
          FOREIGN KEY (ruta_preferida_id) REFERENCES ruta (id) ON DELETE SET NULL;

      ALTER TABLE credencial
          ADD CONSTRAINT fk_credencial_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE;

      ALTER TABLE segundo_factor
          ADD CONSTRAINT fk_segundo_factor_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE;

      ALTER TABLE sesion
          ADD CONSTRAINT fk_sesion_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE;

      ALTER TABLE desafio_autenticacion
          ADD CONSTRAINT fk_desafio_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE;

      ALTER TABLE usuario_rol
          ADD CONSTRAINT fk_usuario_rol_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
          ADD CONSTRAINT fk_usuario_rol_rol
          FOREIGN KEY (rol_id) REFERENCES rol (id) ON DELETE RESTRICT;

      ALTER TABLE unidad
          ADD CONSTRAINT fk_unidad_version_publicada
          FOREIGN KEY (version_publicada_id, id)
          REFERENCES version_unidad (id, unidad_id);

      ALTER TABLE version_unidad
          ADD CONSTRAINT fk_version_unidad_unidad
          FOREIGN KEY (unidad_id) REFERENCES unidad (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_version_unidad_tema
          FOREIGN KEY (tema_id) REFERENCES tema (id) ON DELETE RESTRICT;

      ALTER TABLE revision_editorial
          ADD CONSTRAINT fk_revision_version
          FOREIGN KEY (version_id) REFERENCES version_unidad (id) ON DELETE CASCADE,
          ADD CONSTRAINT fk_revision_revisor
          FOREIGN KEY (revisor_id) REFERENCES usuario (id) ON DELETE RESTRICT;

      ALTER TABLE fuente_version
          ADD CONSTRAINT fk_fuente_version_fuente
          FOREIGN KEY (fuente_id) REFERENCES fuente (id) ON DELETE RESTRICT;

      ALTER TABLE unidad_fuente
          ADD CONSTRAINT fk_unidad_fuente_version
          FOREIGN KEY (version_id) REFERENCES version_unidad (id) ON DELETE CASCADE,
          ADD CONSTRAINT fk_unidad_fuente_edicion
          FOREIGN KEY (fuente_version_id) REFERENCES fuente_version (id) ON DELETE RESTRICT;

      ALTER TABLE ruta
          ADD CONSTRAINT fk_ruta_version_actual
          FOREIGN KEY (version_actual_id, id)
          REFERENCES version_ruta (id, ruta_id);

      ALTER TABLE version_ruta
          ADD CONSTRAINT fk_version_ruta_ruta
          FOREIGN KEY (ruta_id) REFERENCES ruta (id) ON DELETE RESTRICT;

      ALTER TABLE ruta_unidad
          ADD CONSTRAINT fk_ruta_unidad_version
          FOREIGN KEY (ruta_version_id) REFERENCES version_ruta (id) ON DELETE CASCADE,
          ADD CONSTRAINT fk_ruta_unidad_unidad
          FOREIGN KEY (unidad_id) REFERENCES unidad (id) ON DELETE RESTRICT;

      ALTER TABLE inscripcion_ruta
          ADD CONSTRAINT fk_inscripcion_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_inscripcion_version_ruta
          FOREIGN KEY (ruta_version_id) REFERENCES version_ruta (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_inscripcion_migrada_de
          FOREIGN KEY (migrada_de_id, usuario_id)
          REFERENCES inscripcion_ruta (id, usuario_id) ON DELETE RESTRICT;

      ALTER TABLE intento
          ADD CONSTRAINT fk_intento_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_intento_unidad
          FOREIGN KEY (unidad_id) REFERENCES unidad (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_intento_version
          FOREIGN KEY (version_id, unidad_id)
          REFERENCES version_unidad (id, unidad_id) ON DELETE RESTRICT;

      ALTER TABLE credito_unidad
          ADD CONSTRAINT fk_credito_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_credito_unidad
          FOREIGN KEY (unidad_id) REFERENCES unidad (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_credito_intento_origen
          FOREIGN KEY (intento_origen_id, usuario_id, unidad_id)
          REFERENCES intento (id, usuario_id, unidad_id) ON DELETE RESTRICT;

      ALTER TABLE usuario_insignia
          ADD CONSTRAINT fk_usuario_insignia_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_usuario_insignia_insignia
          FOREIGN KEY (insignia_id) REFERENCES insignia (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_usuario_insignia_intento
          FOREIGN KEY (intento_origen_id, usuario_id)
          REFERENCES intento (id, usuario_id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_usuario_insignia_inscripcion
          FOREIGN KEY (inscripcion_origen_id, usuario_id)
          REFERENCES inscripcion_ruta (id, usuario_id) ON DELETE RESTRICT;

      ALTER TABLE membresia_grupo
          ADD CONSTRAINT fk_membresia_grupo
          FOREIGN KEY (grupo_id) REFERENCES grupo (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_membresia_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT;

      ALTER TABLE version_documento
          ADD CONSTRAINT fk_version_documento_padre
          FOREIGN KEY (documento_id) REFERENCES documento_legal (id) ON DELETE RESTRICT;

      ALTER TABLE evento_legal
          ADD CONSTRAINT fk_evento_legal_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
          ADD CONSTRAINT fk_evento_legal_version
          FOREIGN KEY (version_documento_id) REFERENCES version_documento (id) ON DELETE RESTRICT;

      ALTER TABLE auditoria
          ADD CONSTRAINT fk_auditoria_actor
          FOREIGN KEY (actor_id) REFERENCES usuario (id) ON DELETE SET NULL;

      ALTER TABLE solicitud_privacidad
          ADD CONSTRAINT fk_solicitud_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX idx_intento_historial
          ON intento (usuario_id, finalizacion DESC, id DESC);

      CREATE INDEX idx_intento_reporte
          ON intento (finalizacion, version_id, usuario_id)
          WHERE estado = 'finalizado';

      CREATE INDEX idx_version_unidad_catalogo
          ON version_unidad (tema_id, dificultad, id);

      CREATE UNIQUE INDEX uq_membresia_grupo_abierta
          ON membresia_grupo (grupo_id, usuario_id) WHERE salida IS NULL;

      CREATE INDEX idx_desafio_autenticacion_usuario
          ON desafio_autenticacion (usuario_id, expira_en);

      CREATE INDEX idx_auditoria_bd_fecha
          ON auditoria_bd (fecha_servidor);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION registrar_auditoria_bd()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
          v_fila     JSONB;
          v_anterior JSONB;
          v_nuevo    JSONB;
      BEGIN
          IF TG_OP = 'DELETE' THEN
              v_fila := to_jsonb(OLD);
              v_anterior := v_fila - 'verificador_argon2id' - 'secreto_cifrado' - 'token_hash';
              v_nuevo := NULL;
          ELSE
              v_fila := to_jsonb(NEW);
              v_anterior := CASE WHEN TG_OP = 'UPDATE'
                  THEN to_jsonb(OLD) - 'verificador_argon2id' - 'secreto_cifrado' - 'token_hash'
                  ELSE NULL END;
              v_nuevo := v_fila - 'verificador_argon2id' - 'secreto_cifrado' - 'token_hash';
          END IF;
          INSERT INTO auditoria_bd
              (usuario_bd, operacion, esquema, tabla, registro_id,
               datos_anteriores, datos_nuevos, aplicacion, direccion_ip)
          VALUES (current_user, TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME,
                  COALESCE(v_fila ->> 'id', v_fila ->> 'usuario_id'),
                  v_anterior, v_nuevo,
                  current_setting('application_name', true), inet_client_addr());
          RETURN COALESCE(NEW, OLD);
      END;
      $$;

      CREATE TRIGGER trg_auditoria_bd_usuario
          AFTER INSERT OR UPDATE OR DELETE ON usuario
          FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_bd();

      CREATE TRIGGER trg_auditoria_bd_credencial
          AFTER INSERT OR UPDATE OR DELETE ON credencial
          FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_bd();

      CREATE TRIGGER trg_auditoria_bd_segundo_factor
          AFTER INSERT OR UPDATE OR DELETE ON segundo_factor
          FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_bd();

      CREATE TRIGGER trg_auditoria_bd_usuario_rol
          AFTER INSERT OR UPDATE OR DELETE ON usuario_rol
          FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_bd();

      CREATE TRIGGER trg_auditoria_bd_documento_legal
          AFTER INSERT OR UPDATE OR DELETE ON documento_legal
          FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_bd();

      CREATE TRIGGER trg_auditoria_bd_auditoria
          AFTER INSERT OR UPDATE OR DELETE ON auditoria
          FOR EACH ROW EXECUTE FUNCTION registrar_auditoria_bd();
    `);

    await queryRunner.query(`
      INSERT INTO rol (codigo, nombre) VALUES
          ('APRENDIZ', 'Aprendiz'),
          ('ADMIN_CONTENIDO', 'Administrador de contenido'),
          ('ADMIN_TECNICO', 'Administrador técnico')
      ON CONFLICT (codigo) DO NOTHING;

      INSERT INTO guarda_integridad (clave) VALUES ('admin_tecnico_activo')
      ON CONFLICT (clave) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_auditoria_bd_auditoria ON auditoria;
      DROP TRIGGER IF EXISTS trg_auditoria_bd_documento_legal ON documento_legal;
      DROP TRIGGER IF EXISTS trg_auditoria_bd_usuario_rol ON usuario_rol;
      DROP TRIGGER IF EXISTS trg_auditoria_bd_segundo_factor ON segundo_factor;
      DROP TRIGGER IF EXISTS trg_auditoria_bd_credencial ON credencial;
      DROP TRIGGER IF EXISTS trg_auditoria_bd_usuario ON usuario;
      DROP FUNCTION IF EXISTS registrar_auditoria_bd();
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS guarda_integridad CASCADE;
      DROP TABLE IF EXISTS solicitud_privacidad CASCADE;
      DROP TABLE IF EXISTS auditoria_bd CASCADE;
      DROP TABLE IF EXISTS auditoria CASCADE;
      DROP TABLE IF EXISTS evento_legal CASCADE;
      DROP TABLE IF EXISTS version_documento CASCADE;
      DROP TABLE IF EXISTS membresia_grupo CASCADE;
      DROP TABLE IF EXISTS usuario_insignia CASCADE;
      DROP TABLE IF EXISTS credito_unidad CASCADE;
      DROP TABLE IF EXISTS intento CASCADE;
      DROP TABLE IF EXISTS inscripcion_ruta CASCADE;
      DROP TABLE IF EXISTS ruta_unidad CASCADE;
      DROP TABLE IF EXISTS version_ruta CASCADE;
      DROP TABLE IF EXISTS ruta CASCADE;
      DROP TABLE IF EXISTS unidad_fuente CASCADE;
      DROP TABLE IF EXISTS fuente_version CASCADE;
      DROP TABLE IF EXISTS revision_editorial CASCADE;
      DROP TABLE IF EXISTS version_unidad CASCADE;
      DROP TABLE IF EXISTS unidad CASCADE;
      DROP TABLE IF EXISTS usuario_rol CASCADE;
      DROP TABLE IF EXISTS desafio_autenticacion CASCADE;
      DROP TABLE IF EXISTS sesion CASCADE;
      DROP TABLE IF EXISTS segundo_factor CASCADE;
      DROP TABLE IF EXISTS credencial CASCADE;
      DROP TABLE IF EXISTS usuario CASCADE;
      DROP TABLE IF EXISTS grupo CASCADE;
      DROP TABLE IF EXISTS insignia CASCADE;
      DROP TABLE IF EXISTS documento_legal CASCADE;
      DROP TABLE IF EXISTS fuente CASCADE;
      DROP TABLE IF EXISTS tema CASCADE;
      DROP TABLE IF EXISTS rol CASCADE;
    `);
  }
}
