import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
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

describe('Groups & Reports (e2e con PostgreSQL 18.6)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

  let cookieAdminTecnico: string;
  let cookieAdminContenido: string;
  let cookieAprendiz: string;

  let aprendicesIds: number[] = [];
  let unidadNormaId: number;
  let versionNorma1Id: number;
  let versionNorma2Id: number;
  let unidadAprendeId: number;
  let versionAprende1Id: number;
  let rutaId: number;

  const crearUsuarioConRolY2fa = async (
    nombre: string,
    correo: string,
    rolCodigo?: 'ADMIN_TECNICO' | 'ADMIN_CONTENIDO',
  ): Promise<{ id: number; cookie: string }> => {
    const claveSintetica = 'clave grupo reporte segura 2026';
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

    const adminTech = await crearUsuarioConRolY2fa(
      'Admin Tecnico Grupos',
      'admintech.grupos@eticore.edu.mx',
      'ADMIN_TECNICO',
    );
    cookieAdminTecnico = adminTech.cookie;

    const adminCont = await crearUsuarioConRolY2fa(
      'Admin Contenido Grupos',
      'admincont.grupos@eticore.edu.mx',
      'ADMIN_CONTENIDO',
    );
    cookieAdminContenido = adminCont.cookie;

    aprendicesIds = [];
    for (let i = 1; i <= 5; i += 1) {
      const apr = await crearUsuarioConRolY2fa(
        `Aprendiz ${i}`,
        `aprendiz.g${i}@eticore.edu.mx`,
      );
      aprendicesIds.push(apr.id);
      if (i === 1) {
        cookieAprendiz = apr.cookie;
      }
    }

    const temas = (await appDataSource.query(
      `INSERT INTO tema (nombre, descripcion, activo)
       VALUES ('Ética en Grupos', 'Tema de prueba', TRUE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    const temaId = temas[0].id;

    // Unidad NormaMatch con 2 versiones publicadas (V1 y V2)
    const uNorma = (await appDataSource.query(
      `INSERT INTO unidad (tipo, activa, muestra_publica)
       VALUES ('normamatch', TRUE, FALSE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    unidadNormaId = uNorma[0].id;

    const contenidoNorma = {
      situaciones: [
        {
          id: 'sit1',
          enunciado: 'Situacion 1',
          opciones: [
            { id: 'opA', texto: 'A' },
            { id: 'opB', texto: 'B' },
          ],
          respuesta_correcta: 'opA',
          explicacion: 'Explicacion 1',
        },
      ],
    };

    const vn1 = (await appDataSource.query(
      `INSERT INTO version_unidad
         (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
       VALUES ($1, 1, 'NormaMatch V1', 'Desc V1', $2, 'basico', 'publicado', 1, $3::jsonb, '2026-10-01T00:00:00Z')
       RETURNING id`,
      [unidadNormaId, temaId, JSON.stringify(contenidoNorma)],
    )) as Array<{ id: string }>;
    versionNorma1Id = Number(vn1[0].id);

    const vn2 = (await appDataSource.query(
      `INSERT INTO version_unidad
         (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
       VALUES ($1, 2, 'NormaMatch V2', 'Desc V2', $2, 'intermedio', 'publicado', 1, $3::jsonb, '2026-10-15T00:00:00Z')
       RETURNING id`,
      [unidadNormaId, temaId, JSON.stringify(contenidoNorma)],
    )) as Array<{ id: string }>;
    versionNorma2Id = Number(vn2[0].id);

    await appDataSource.query(
      `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
      [versionNorma2Id, unidadNormaId],
    );

    // Unidad Aprende
    const uApr = (await appDataSource.query(
      `INSERT INTO unidad (tipo, activa, muestra_publica)
       VALUES ('aprende', TRUE, FALSE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    unidadAprendeId = uApr[0].id;

    const contenidoApr = {
      objetivo: 'Objetivo aprende',
      secciones: [{ id: 's1', orden: 1, titulo: 'S1', cuerpo: 'Cuerpo' }],
      ejemplo: 'Ejemplo',
    };
    const va1 = (await appDataSource.query(
      `INSERT INTO version_unidad
         (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
       VALUES ($1, 1, 'Aprende V1', 'Desc A1', $2, 'basico', 'publicado', 1, $3::jsonb, '2026-10-01T00:00:00Z')
       RETURNING id`,
      [unidadAprendeId, temaId, JSON.stringify(contenidoApr)],
    )) as Array<{ id: string }>;
    versionAprende1Id = Number(va1[0].id);

    await appDataSource.query(
      `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
      [versionAprende1Id, unidadAprendeId],
    );

    // Ruta que contiene solo unidadNormaId (para probar filtro ruta_id en reporte)
    const r = (await appDataSource.query(
      `INSERT INTO ruta (nombre, activa) VALUES ('TI Grupos', TRUE) RETURNING id`,
    )) as Array<{ id: number }>;
    rutaId = r[0].id;

    const vr = (await appDataSource.query(
      `INSERT INTO version_ruta (ruta_id, numero, publicada_en)
       VALUES ($1, 1, CURRENT_TIMESTAMP) RETURNING id`,
      [rutaId],
    )) as Array<{ id: string }>;
    const versionRutaId = Number(vr[0].id);

    await appDataSource.query(
      `UPDATE ruta SET version_actual_id = $1 WHERE id = $2`,
      [versionRutaId, rutaId],
    );
    await appDataSource.query(
      `INSERT INTO ruta_unidad (ruta_version_id, unidad_id, orden, obligatoria)
       VALUES ($1, $2, 1, TRUE)`,
      [versionRutaId, unidadNormaId],
    );
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  const insertarIntentoFinalizado = async (params: {
    usuarioId: number;
    unidadId: number;
    versionId: number;
    numero: number;
    inicio: string;
    finalizacion: string;
    puntuacion: number | null;
  }): Promise<void> => {
    await appDataSource.query(
      `INSERT INTO intento
         (id, usuario_id, unidad_id, version_id, numero, estado, inicio, finalizacion, puntuacion, revision, esquema_version, recorrido)
       VALUES ($1, $2, $3, $4, $5, 'finalizado', $6::timestamptz, $7::timestamptz, $8, 1, 1, '{}'::jsonb)`,
      [
        randomUUID(),
        params.usuarioId,
        params.unidadId,
        params.versionId,
        params.numero,
        params.inicio,
        params.finalizacion,
        params.puntuacion,
      ],
    );
  };

  it('valida autorizacion, intervalos sin solapamiento, reingreso valido y concurrencia en membresia', async () => {
    // Aprendiz no puede crear grupos
    const denegadoAprendiz = await request(app.getHttpServer())
      .post('/api/v1/grupos')
      .set('Cookie', cookieAprendiz)
      .send({ nombre: 'Grupo No', periodo: '2026-2' });
    expect(denegadoAprendiz.status).toBe(403);

    // ADMIN_CONTENIDO no puede crear grupos (RN-14)
    const denegadoContenido = await request(app.getHttpServer())
      .post('/api/v1/grupos')
      .set('Cookie', cookieAdminContenido)
      .send({ nombre: 'Grupo No', periodo: '2026-2' });
    expect(denegadoContenido.status).toBe(403);

    // ADMIN_TECNICO crea grupo
    const crearRes = await request(app.getHttpServer())
      .post('/api/v1/grupos')
      .set('Cookie', cookieAdminTecnico)
      .send({ nombre: 'Grupo 7A', periodo: '2026-2' });
    expect(crearRes.status).toBe(201);
    const grupoId = crearRes.body.id as number;

    const u1 = aprendicesIds[0];
    const u2 = aprendicesIds[1];

    // Alta [t1, NULL)
    const alta1 = await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({ usuario_id: u1, ingreso: '2026-10-01T00:00:00.000Z' });
    expect(alta1.status).toBe(201);

    // Doble apertura simultanea rechazada (409 MEMBRESIA_SOLAPADA)
    const dobleApertura = await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({ usuario_id: u1, ingreso: '2026-10-05T00:00:00.000Z' });
    expect(dobleApertura.status).toBe(409);
    expect(dobleApertura.body.error.codigo).toBe('MEMBRESIA_SOLAPADA');

    // Retirar integrante en t2 -> cierra [t1, t2)
    const retirar1 = await request(app.getHttpServer())
      .patch(`/api/v1/grupos/${grupoId}/integrantes/${u1}/retirar`)
      .set('Cookie', cookieAdminTecnico)
      .send({ salida: '2026-10-10T00:00:00.000Z' });
    expect(retirar1.status).toBe(200);
    expect(new Date(retirar1.body.salida as string).toISOString()).toBe(
      '2026-10-10T00:00:00.000Z',
    );

    // Solapamiento dentro de [t1, t2) rechazado
    const solapadoInterno = await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({ usuario_id: u1, ingreso: '2026-10-05T00:00:00.000Z' });
    expect(solapadoInterno.status).toBe(409);
    expect(solapadoInterno.body.error.codigo).toBe('MEMBRESIA_SOLAPADA');

    // Solapamiento previo que cruza [t1, t2) rechazado
    const solapadoCruce = await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({
        usuario_id: u1,
        ingreso: '2026-09-20T00:00:00.000Z',
        salida: '2026-10-02T00:00:00.000Z',
      });
    expect(solapadoCruce.status).toBe(409);

    // Reingreso valido en limite semiabierto t2 = salida anterior [2026-10-10, NULL)
    const reingreso = await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({ usuario_id: u1, ingreso: '2026-10-10T00:00:00.000Z' });
    expect(reingreso.status).toBe(201);

    // Altas concurrentes sobre mismo (grupo, u2): solo una debe prosperar
    const [concA, concB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/grupos/${grupoId}/integrantes`)
        .set('Cookie', cookieAdminTecnico)
        .send({ usuario_id: u2, ingreso: '2026-10-01T00:00:00.000Z' }),
      request(app.getHttpServer())
        .post(`/api/v1/grupos/${grupoId}/integrantes`)
        .set('Cookie', cookieAdminTecnico)
        .send({ usuario_id: u2, ingreso: '2026-10-02T00:00:00.000Z' }),
    ]);
    const statuses = [concA.status, concB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    // Listado conserva historial de intervalos cerrados y abiertos
    const integrantesRes = await request(app.getHttpServer())
      .get(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico);
    expect(integrantesRes.status).toBe(200);
    expect(integrantesRes.body.items).toHaveLength(3); // 2 de u1 + 1 de u2
  });

  it('reporte suprime promedio con 4 participantes, lo muestra con 5, no duplica por reingreso y separa versiones', async () => {
    const crearRes = await request(app.getHttpServer())
      .post('/api/v1/grupos')
      .set('Cookie', cookieAdminTecnico)
      .send({ nombre: 'Grupo Reporte', periodo: '2026-2' });
    expect(crearRes.status).toBe(201);
    const grupoId = crearRes.body.id as number;

    const [u1, u2, u3, u4, u5] = aprendicesIds;

    // U1 entra [Oct 01, Oct 10), sale, y reingresa [Oct 20, NULL)
    await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({ usuario_id: u1, ingreso: '2026-10-01T00:00:00.000Z' });
    await request(app.getHttpServer())
      .patch(`/api/v1/grupos/${grupoId}/integrantes/${u1}/retirar`)
      .set('Cookie', cookieAdminTecnico)
      .send({ salida: '2026-10-10T00:00:00.000Z' });
    await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({ usuario_id: u1, ingreso: '2026-10-20T00:00:00.000Z' });

    // U2, U3, U4 entran el Oct 01
    for (const uId of [u2, u3, u4]) {
      await request(app.getHttpServer())
        .post(`/api/v1/grupos/${grupoId}/integrantes`)
        .set('Cookie', cookieAdminTecnico)
        .send({ usuario_id: uId, ingreso: '2026-10-01T00:00:00.000Z' });
    }

    // Intentos de U1 en NormaMatch V1:
    // - dentro intervalo 1: 60
    // - en hueco Oct 15 (fuera de membresia, debe ignorarse): 100
    // - dentro intervalo 2: 90 (mejor nota valida = 90)
    // - exactamente en hasta (Nov 01, fuera de [desde, hasta), debe ignorarse): 100
    await insertarIntentoFinalizado({
      usuarioId: u1,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 1,
      inicio: '2026-10-02T09:00:00.000Z',
      finalizacion: '2026-10-02T10:00:00.000Z',
      puntuacion: 60,
    });
    await insertarIntentoFinalizado({
      usuarioId: u1,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 2,
      inicio: '2026-10-15T09:00:00.000Z',
      finalizacion: '2026-10-15T10:00:00.000Z',
      puntuacion: 100,
    });
    await insertarIntentoFinalizado({
      usuarioId: u1,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 3,
      inicio: '2026-10-22T09:00:00.000Z',
      finalizacion: '2026-10-22T10:00:00.000Z',
      puntuacion: 90,
    });
    await insertarIntentoFinalizado({
      usuarioId: u1,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 4,
      inicio: '2026-11-01T00:00:00.000Z',
      finalizacion: '2026-11-01T00:00:00.000Z',
      puntuacion: 100,
    });

    // U2, U3, U4 en NormaMatch V1 -> 80, 70, 85 (con U1=90 son 4 participantes)
    await insertarIntentoFinalizado({
      usuarioId: u2,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 1,
      inicio: '2026-10-03T09:00:00.000Z',
      finalizacion: '2026-10-03T10:00:00.000Z',
      puntuacion: 80,
    });
    await insertarIntentoFinalizado({
      usuarioId: u3,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 1,
      inicio: '2026-10-04T09:00:00.000Z',
      finalizacion: '2026-10-04T10:00:00.000Z',
      puntuacion: 70,
    });
    await insertarIntentoFinalizado({
      usuarioId: u4,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 1,
      inicio: '2026-10-05T09:00:00.000Z',
      finalizacion: '2026-10-05T10:00:00.000Z',
      puntuacion: 85,
    });

    // U1 y U2 tambien cursan NormaMatch V2 (debe ir en celda separada de V1)
    await insertarIntentoFinalizado({
      usuarioId: u1,
      unidadId: unidadNormaId,
      versionId: versionNorma2Id,
      numero: 5,
      inicio: '2026-10-25T09:00:00.000Z',
      finalizacion: '2026-10-25T10:00:00.000Z',
      puntuacion: 100,
    });
    await insertarIntentoFinalizado({
      usuarioId: u2,
      unidadId: unidadNormaId,
      versionId: versionNorma2Id,
      numero: 2,
      inicio: '2026-10-26T09:00:00.000Z',
      finalizacion: '2026-10-26T10:00:00.000Z',
      puntuacion: 50,
    });

    // U1 y U2 completan Aprende V1 (promedio "No aplica", conteos visibles)
    await insertarIntentoFinalizado({
      usuarioId: u1,
      unidadId: unidadAprendeId,
      versionId: versionAprende1Id,
      numero: 1,
      inicio: '2026-10-06T09:00:00.000Z',
      finalizacion: '2026-10-06T10:00:00.000Z',
      puntuacion: null,
    });
    await insertarIntentoFinalizado({
      usuarioId: u2,
      unidadId: unidadAprendeId,
      versionId: versionAprende1Id,
      numero: 1,
      inicio: '2026-10-07T09:00:00.000Z',
      finalizacion: '2026-10-07T10:00:00.000Z',
      puntuacion: null,
    });

    const desde = '2026-10-01T00:00:00.000Z';
    const hasta = '2026-11-01T00:00:00.000Z';

    // Consulta con 4 participantes (ADMIN_CONTENIDO tambien autorizado)
    const rep4 = await request(app.getHttpServer())
      .get(`/api/v1/reportes/grupos/${grupoId}`)
      .set('Cookie', cookieAdminContenido)
      .query({ desde, hasta });
    expect(rep4.status).toBe(200);
    expect(rep4.body.celdas).toHaveLength(3);

    const celdaV1Con4 = rep4.body.celdas.find(
      (c: { version_id: number }) => c.version_id === versionNorma1Id,
    );
    expect(celdaV1Con4).toEqual({
      unidad_id: unidadNormaId,
      version_id: versionNorma1Id,
      version_numero: 1,
      titulo: 'NormaMatch V1',
      tipo: 'normamatch',
      participantes: 4, // U1 cuenta una sola vez pese al reingreso e intentos multiples
      total_intentos_finalizados: 5, // 2 de U1 dentro de membresia + U2 + U3 + U4
      participantes_con_dominio: null,
      promedio: null,
      celda_suprimida: true,
    });

    const celdaV2 = rep4.body.celdas.find(
      (c: { version_id: number }) => c.version_id === versionNorma2Id,
    );
    expect(celdaV2.participantes).toBe(2);
    expect(celdaV2.promedio).toBeNull();
    expect(celdaV2.celda_suprimida).toBe(true);

    const celdaAprende = rep4.body.celdas.find(
      (c: { version_id: number }) => c.version_id === versionAprende1Id,
    );
    expect(celdaAprende).toEqual({
      unidad_id: unidadAprendeId,
      version_id: versionAprende1Id,
      version_numero: 1,
      titulo: 'Aprende V1',
      tipo: 'aprende',
      participantes: 2,
      total_intentos_finalizados: 2,
      participantes_con_dominio: null,
      promedio: 'No aplica',
      celda_suprimida: false,
    });

    // Ahora ingresa U5 y finaliza NormaMatch V1 con 95 -> promedio = (90+80+70+85+95)/5 = 84
    await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', cookieAdminTecnico)
      .send({ usuario_id: u5, ingreso: '2026-10-01T00:00:00.000Z' });
    await insertarIntentoFinalizado({
      usuarioId: u5,
      unidadId: unidadNormaId,
      versionId: versionNorma1Id,
      numero: 1,
      inicio: '2026-10-08T09:00:00.000Z',
      finalizacion: '2026-10-08T10:00:00.000Z',
      puntuacion: 95,
    });

    const rep5 = await request(app.getHttpServer())
      .get(`/api/v1/reportes/grupos/${grupoId}`)
      .set('Cookie', cookieAdminTecnico)
      .query({ desde, hasta, ruta_id: rutaId });
    expect(rep5.status).toBe(200);
    // Con filtro ruta_id=rutaId solo entran las celdas de unidadNormaId (V1 y V2)
    expect(rep5.body.celdas).toHaveLength(2);

    const celdaV1Con5 = rep5.body.celdas.find(
      (c: { version_id: number }) => c.version_id === versionNorma1Id,
    );
    expect(celdaV1Con5).toEqual({
      unidad_id: unidadNormaId,
      version_id: versionNorma1Id,
      version_numero: 1,
      titulo: 'NormaMatch V1',
      tipo: 'normamatch',
      participantes: 5,
      total_intentos_finalizados: 6,
      participantes_con_dominio: 4, // 90, 80, 85, 95 (>= 80)
      promedio: 84,
      celda_suprimida: false,
    });

    // V2 sigue suprimida aunque V1 tenga >= 5 porque las versiones nunca se mezclan
    const celdaV2Tras5 = rep5.body.celdas.find(
      (c: { version_id: number }) => c.version_id === versionNorma2Id,
    );
    expect(celdaV2Tras5.participantes).toBe(2);
    expect(celdaV2Tras5.promedio).toBeNull();
    expect(celdaV2Tras5.celda_suprimida).toBe(true);

    // Desactivar grupo conserva membresias y reporte historico
    const desactivar = await request(app.getHttpServer())
      .patch(`/api/v1/grupos/${grupoId}/desactivar`)
      .set('Cookie', cookieAdminTecnico);
    expect(desactivar.status).toBe(200);
    expect(desactivar.body.activo).toBe(false);

    const repTrasBaja = await request(app.getHttpServer())
      .get(`/api/v1/reportes/grupos/${grupoId}`)
      .set('Cookie', cookieAdminTecnico)
      .query({ desde, hasta });
    expect(repTrasBaja.status).toBe(200);
    expect(repTrasBaja.body.grupo.activo).toBe(false);
    expect(repTrasBaja.body.celdas).toHaveLength(3);
  });
});
