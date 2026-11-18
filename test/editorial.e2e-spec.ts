import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import {
  calcularPasoTotp,
  generarCodigoTotpEnPaso,
} from '../src/common/utils/totp.js';
import {
  type EphemeralTestDb,
  startEphemeralPostgres,
} from './helpers/postgres-test-db.js';

function decodificarBase32(base32: string): Buffer {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];

  for (const ch of base32.toUpperCase()) {
    const idx = alfabeto.indexOf(ch);
    if (idx === -1) {
      continue;
    }
    valor = (valor << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function extraerCookieSid(cabeceras: string[] | string | undefined): string {
  const lista = Array.isArray(cabeceras)
    ? cabeceras
    : cabeceras
      ? [cabeceras]
      : [];
  const encontrada = lista.find((c) => c.startsWith('eticore_sid='));
  if (!encontrada) {
    throw new Error('Cookie eticore_sid no presente');
  }
  return encontrada.split(';')[0] ?? '';
}

function construirContenidoNormaMatch(
  enunciado: string,
  explicacion = 'Explicación normativa vigente',
  referenciaLocal?: string,
): Record<string, unknown> {
  const situacion: Record<string, unknown> = {
    id: 'sit1',
    enunciado,
    opciones: [
      { id: 'op1', texto: 'Opción 1' },
      { id: 'op2', texto: 'Opción 2' },
    ],
    respuesta_correcta: 'op1',
    explicacion,
  };
  if (referenciaLocal) {
    situacion.referencia_local = referenciaLocal;
  }
  return { situaciones: [situacion] };
}

describe('Editorial flujo completo (e2e con PostgreSQL 18.6)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

  let cookieAdminContenido: string;
  let adminContenidoId: number;
  let cookieAdminTecnico: string;
  let cookieAprendiz: string;

  let temaId: number;
  let fuenteVersionId: number;

  const crearUsuarioConRolY2fa = async (
    nombre: string,
    correo: string,
    rolCodigo?: 'ADMIN_TECNICO' | 'ADMIN_CONTENIDO',
  ): Promise<{ id: number; cookie: string }> => {
    const claveSintetica = 'clave editorial e2e segura 2026';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: nombre,
        correo,
        contrasena: claveSintetica,
      });
    expect(reg.status).toBe(201);
    const id = reg.body.usuario.id as number;

    if (rolCodigo) {
      await appDataSource.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         SELECT $1, id FROM rol WHERE codigo = $2`,
        [id, rolCodigo],
      );
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo, contrasena: claveSintetica });
    expect(loginRes.status).toBe(200);
    const cookie = extraerCookieSid(loginRes.headers['set-cookie']);

    if (rolCodigo) {
      const ini2fa = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/iniciar')
        .set('Cookie', cookie);
      expect(ini2fa.status).toBe(201);

      const bytes = decodificarBase32(ini2fa.body.clave_base32 as string);
      const codigo = generarCodigoTotpEnPaso(
        bytes,
        calcularPasoTotp(Date.now(), 30),
      );
      const conf2fa = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/confirmar')
        .set('Cookie', cookie)
        .send({ codigo });
      expect(conf2fa.status).toBe(200);
    }

    return { id, cookie };
  };

  beforeAll(async () => {
    testDb = await startEphemeralPostgres();

    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = testDb.url;
    process.env.AUTH_DATABASE_URL = testDb.url;
    process.env.MIGRATION_DATABASE_URL = testDb.url;
    process.env.DB_POOL_MAX = '10';
    process.env.DB_SSL = 'false';
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    process.env.SESSION_COOKIE_NAME = 'eticore_sid';
    process.env.SESSION_COOKIE_SECURE = 'true';
    process.env.SESSION_IDLE_TIMEOUT_MINUTES = '30';
    process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS = '8';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    appDataSource = app.get(DataSource);

    const adminCont = await crearUsuarioConRolY2fa(
      'Editor Eticore',
      'editor.e2e@eticore.edu.mx',
      'ADMIN_CONTENIDO',
    );
    adminContenidoId = adminCont.id;
    cookieAdminContenido = adminCont.cookie;

    const adminTech = await crearUsuarioConRolY2fa(
      'Tecnico Eticore',
      'tecnico.ed@eticore.edu.mx',
      'ADMIN_TECNICO',
    );
    cookieAdminTecnico = adminTech.cookie;

    const apr = await crearUsuarioConRolY2fa(
      'Aprendiz Editorial',
      'aprendiz.ed@eticore.edu.mx',
    );
    cookieAprendiz = apr.cookie;

    const temas = (await appDataSource.query(
      `INSERT INTO tema (nombre, descripcion, activo)
       VALUES ('Ética Editorial', 'Tema de prueba editorial', TRUE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    temaId = temas[0].id;

    const fuentes = (await appDataSource.query(
      `INSERT INTO fuente (nombre) VALUES ('Ley Sintética de Prueba') RETURNING id`,
    )) as Array<{ id: number }>;
    const fv = (await appDataSource.query(
      `INSERT INTO fuente_version
         (fuente_id, titulo, autor_organismo, url, fecha_o_version)
       VALUES ($1, 'Texto Base', 'Organismo Sintético', 'https://ejemplo.local/ley', '2026-01')
       RETURNING id`,
      [fuentes[0].id],
    )) as Array<{ id: string }>;
    fuenteVersionId = Number(fv[0].id);
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  const aprobarYPublicar = async (versionId: number): Promise<void> => {
    const rev = await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${versionId}/revisiones`)
      .set('Cookie', cookieAdminContenido)
      .send({ resultado: 'aprobada' });
    expect(rev.status).toBe(201);

    const pub = await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${versionId}/publicar`)
      .set('Cookie', cookieAdminContenido);
    expect(pub.status).toBe(200);
  };

  it('restringe editorial a ADMIN_CONTENIDO, mantiene puntero en V3 al crear borrador V4, rechaza huella desactualizada o sin revision, y desactiva unidad conservando historial', async () => {
    // 1) RN-14: APRENDIZ y ADMIN_TECNICO sin rol editorial no pueden acceder a /editorial/*
    const rechazoAprendiz = await request(app.getHttpServer())
      .post('/api/v1/editorial/unidades')
      .set('Cookie', cookieAprendiz)
      .send({ tipo: 'normamatch' });
    expect(rechazoAprendiz.status).toBe(403);

    const rechazoTecnico = await request(app.getHttpServer())
      .post('/api/v1/editorial/unidades')
      .set('Cookie', cookieAdminTecnico)
      .send({ tipo: 'normamatch' });
    expect(rechazoTecnico.status).toBe(403);

    // 2) ADMIN_CONTENIDO crea unidad y publica V1 -> V2 -> V3
    const crearUnidadRes = await request(app.getHttpServer())
      .post('/api/v1/editorial/unidades')
      .set('Cookie', cookieAdminContenido)
      .send({ tipo: 'normamatch', muestra_publica: false });
    expect(crearUnidadRes.status).toBe(201);
    const unidadId = crearUnidadRes.body.id as number;

    let versionV3Id = 0;
    for (const num of [1, 2, 3]) {
      const borrador = await request(app.getHttpServer())
        .post('/api/v1/editorial/versiones')
        .set('Cookie', cookieAdminContenido)
        .send({
          unidad_id: unidadId,
          titulo: `Norma Versión ${num}`,
          descripcion: `Descripción V${num}`,
          tema_id: temaId,
          dificultad: 'basico',
          esquema_version: 1,
          contenido: construirContenidoNormaMatch(
            `Enunciado V${num}`,
            `Explicación V${num}`,
            'REF1',
          ),
          fuentes: [
            {
              clave_local: 'REF1',
              fuente_version_id: fuenteVersionId,
              revisada_en: '2026-11-10',
            },
          ],
        });
      expect(borrador.status).toBe(201);
      expect(borrador.body.numero).toBe(num);
      const vId = borrador.body.id as number;
      await aprobarYPublicar(vId);
      if (num === 3) {
        versionV3Id = vId;
      }
    }

    // Aprendiz abre un intento sobre V3 publicada
    const intentoV3 = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({ unidad_id: unidadId });
    expect(intentoV3.status).toBe(201);
    expect(intentoV3.body.version_id).toBe(versionV3Id);

    // 3) Crear borrador de V4 NO mueve el puntero público de V3
    const crearV4 = await request(app.getHttpServer())
      .post('/api/v1/editorial/versiones')
      .set('Cookie', cookieAdminContenido)
      .send({
        unidad_id: unidadId,
        titulo: 'Norma Versión 4 Borrador',
        descripcion: 'Descripción V4',
        tema_id: temaId,
        dificultad: 'intermedio',
        esquema_version: 1,
        contenido: construirContenidoNormaMatch(
          'Enunciado inicial V4',
          'Explicación inicial V4',
          'REF1',
        ),
        fuentes: [
          {
            clave_local: 'REF1',
            fuente_version_id: fuenteVersionId,
            revisada_en: '2026-11-12',
          },
        ],
      });
    expect(crearV4.status).toBe(201);
    expect(crearV4.body.numero).toBe(4);
    expect(crearV4.body.estado).toBe('borrador');
    const versionV4Id = crearV4.body.id as number;

    const catalogoV3 = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadId}`)
      .set('Cookie', cookieAprendiz);
    expect(catalogoV3.status).toBe(200);
    expect(catalogoV3.body.version_id).toBe(versionV3Id);
    expect(catalogoV3.body.version_numero).toBe(3);

    // 4) Publicar V4 sin revisión aprobada -> 422
    const sinRevision = await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${versionV4Id}/publicar`)
      .set('Cookie', cookieAdminContenido);
    expect(sinRevision.status).toBe(422);
    expect(sinRevision.body.error.codigo).toBe('REVISION_APROBADA_REQUERIDA');

    // 5) Aprobar V4 -> editar V4 antes de publicar -> publicar rechazado con 422 (huella desactualizada)
    const aprobarV4 = await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${versionV4Id}/revisiones`)
      .set('Cookie', cookieAdminContenido)
      .send({ resultado: 'aprobada' });
    expect(aprobarV4.status).toBe(201);

    const editarV4TrasAprobar = await request(app.getHttpServer())
      .patch(`/api/v1/editorial/versiones/${versionV4Id}`)
      .set('Cookie', cookieAdminContenido)
      .send({
        revision_esperada: 1,
        contenido: construirContenidoNormaMatch(
          'Enunciado modificado después de aprobar',
          'Explicación inicial V4',
          'REF1',
        ),
      });
    expect(editarV4TrasAprobar.status).toBe(200);
    expect(editarV4TrasAprobar.body.revision).toBe(2);
    expect(editarV4TrasAprobar.body.huella_actual).not.toBe(
      aprobarV4.body.huella_revisada,
    );

    const publicarConHuellaVieja = await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${versionV4Id}/publicar`)
      .set('Cookie', cookieAdminContenido);
    expect(publicarConHuellaVieja.status).toBe(422);
    expect(publicarConHuellaVieja.body.error.codigo).toBe(
      'HUELLA_EDITORIAL_DESACTUALIZADA',
    );

    // Puntero público sigue intacto en V3
    const catalogoSigueEnV3 = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadId}`)
      .set('Cookie', cookieAprendiz);
    expect(catalogoSigueEnV3.body.version_id).toBe(versionV3Id);

    // 6) Re-aprobar V4 editada y publicar atómicamente -> mueve puntero a V4, V3 sigue intacta
    await aprobarYPublicar(versionV4Id);

    const catalogoEnV4 = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadId}`)
      .set('Cookie', cookieAprendiz);
    expect(catalogoEnV4.status).toBe(200);
    expect(catalogoEnV4.body.version_id).toBe(versionV4Id);
    expect(catalogoEnV4.body.version_numero).toBe(4);

    // V3 conserva su estado 'publicado' e intento abierto en V3 conserva V3
    const v3Fila = (await appDataSource.query(
      `SELECT estado, publicada_en FROM version_unidad WHERE id = $1`,
      [versionV3Id],
    )) as Array<{ estado: string; publicada_en: Date }>;
    expect(v3Fila[0].estado).toBe('publicado');

    const intentoSigueEnV3 = await request(app.getHttpServer())
      .get(`/api/v1/intentos/${intentoV3.body.id}`)
      .set('Cookie', cookieAprendiz);
    expect(intentoSigueEnV3.status).toBe(200);
    expect(intentoSigueEnV3.body.version_id).toBe(versionV3Id);

    // 7) Desactivar unidad impide nuevos intentos pero conserva versiones e historial
    const desactivar = await request(app.getHttpServer())
      .patch(`/api/v1/editorial/unidades/${unidadId}/desactivar`)
      .set('Cookie', cookieAdminContenido);
    expect(desactivar.status).toBe(200);
    expect(desactivar.body.activa).toBe(false);

    const nuevoIntentoBloqueado = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({ unidad_id: unidadId });
    expect(nuevoIntentoBloqueado.status).toBe(404);

    const versionesConservadas = (await appDataSource.query(
      `SELECT count(*)::int AS total FROM version_unidad WHERE unidad_id = $1`,
      [unidadId],
    )) as Array<{ total: number }>;
    expect(versionesConservadas[0].total).toBe(4);

    const accionesAuditoria = (await appDataSource.query(
      `SELECT accion FROM auditoria WHERE actor_id = $1`,
      [adminContenidoId],
    )) as Array<{ accion: string }>;
    const acciones = accionesAuditoria.map((a) => a.accion);
    expect(acciones).toContain('crear_unidad');
    expect(acciones).toContain('crear_version_borrador');
    expect(acciones).toContain('actualizar_version_borrador');
    expect(acciones).toContain('registrar_revision_editorial');
    expect(acciones).toContain('publicar_version');
    expect(acciones).toContain('desactivar_unidad');
  });
});
