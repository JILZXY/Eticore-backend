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
  type EphemeralTestDb,
  startEphemeralPostgres,
} from './helpers/postgres-test-db.js';

describe('Attempts y Gamification (e2e concurrencia e idempotencia)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

  let temaId: number;
  let unidadAprendeId: number;
  let unidadNormaMatchId: number;
  let unidadCasoTechId: number;
  let unidadVersionadaId: number;
  let versionOriginalId: number;
  let cookieAprendiz: string;
  let usuarioId: number;

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

    const temas = (await appDataSource.query(
      `INSERT INTO tema (nombre, descripcion, activo)
       VALUES ('Ética en Ingeniería', 'Tema de prueba', TRUE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    temaId = temas[0].id;

    const crearUnidadPublicada = async (
      tipo: 'aprende' | 'normamatch' | 'casotech',
      titulo: string,
      contenido: Record<string, unknown>,
    ): Promise<{ unidadId: number; versionId: number }> => {
      const u = (await appDataSource.query(
        `INSERT INTO unidad (tipo, activa, muestra_publica)
         VALUES ($1, TRUE, FALSE)
         RETURNING id`,
        [tipo],
      )) as Array<{ id: number }>;
      const unidadId = u[0].id;

      const v = (await appDataSource.query(
        `INSERT INTO version_unidad
           (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
         VALUES ($1, 1, $2, 'Descripción', $3, 'basico', 'publicado', 1, $4::jsonb, CURRENT_TIMESTAMP)
         RETURNING id`,
        [unidadId, titulo, temaId, JSON.stringify(contenido)],
      )) as Array<{ id: string }>;
      const versionId = Number(v[0].id);

      await appDataSource.query(
        `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
        [versionId, unidadId],
      );

      return { unidadId, versionId };
    };

    unidadAprendeId = (
      await crearUnidadPublicada('aprende', 'Lección Aprende Prueba', {
        objetivo: 'Aprender el flujo.',
        secciones: [
          { id: 's1', orden: 1, titulo: 'Sección 1', cuerpo: 'Texto 1' },
          { id: 's2', orden: 2, titulo: 'Sección 2', cuerpo: 'Texto 2' },
        ],
        ejemplo: 'Ejemplo 1',
      })
    ).unidadId;

    unidadNormaMatchId = (
      await crearUnidadPublicada('normamatch', 'Actividad NormaMatch Prueba', {
        situaciones: [
          {
            id: 'sit-1',
            enunciado: 'Situación 1',
            opciones: [
              { id: 'op-a', texto: 'Opción A' },
              { id: 'op-b', texto: 'Opción B' },
            ],
            respuesta_correcta: 'op-a',
            explicacion: 'Explicación V1 correcta.',
          },
          {
            id: 'sit-2',
            enunciado: 'Situación 2',
            opciones: [
              { id: 'op-c', texto: 'Opción C' },
              { id: 'op-d', texto: 'Opción D' },
            ],
            respuesta_correcta: 'op-d',
            explicacion: 'Explicación V1 situación 2.',
          },
        ],
      })
    ).unidadId;

    unidadCasoTechId = (
      await crearUnidadPublicada('casotech', 'Caso CasoTech Prueba', {
        etapa_inicial_id: 'et-1',
        etapas: [
          {
            id: 'et-1',
            titulo: 'Decisión inicial',
            terminal: false,
            alternativas: [
              {
                id: 'alt-1',
                texto: 'Opción óptima',
                ponderacion: 2,
                siguiente_etapa_id: 'et-2',
                explicacion: 'Excelente elección.',
              },
              {
                id: 'alt-0',
                texto: 'Opción riesgosa',
                ponderacion: 0,
                siguiente_etapa_id: 'et-2',
              },
            ],
          },
          {
            id: 'et-2',
            titulo: 'Segunda decisión',
            terminal: false,
            alternativas: [
              {
                id: 'alt-2',
                texto: 'Mitigar',
                ponderacion: 1,
                siguiente_etapa_id: 'et-fin',
              },
            ],
          },
          {
            id: 'et-fin',
            titulo: 'Cierre',
            terminal: true,
          },
        ],
      })
    ).unidadId;

    const versionada = await crearUnidadPublicada(
      'normamatch',
      'NormaMatch Versionada',
      {
        situaciones: [
          {
            id: 'sit-v1',
            enunciado: 'Enunciado V1',
            opciones: [
              { id: 'op-1', texto: 'Opción 1' },
              { id: 'op-2', texto: 'Opción 2' },
            ],
            respuesta_correcta: 'op-1',
            explicacion: 'Explicación original V1',
          },
        ],
      },
    );
    unidadVersionadaId = versionada.unidadId;
    versionOriginalId = versionada.versionId;

    const claveSintetica = 'clave attempts e2e segura 2026';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Aprendiz Intentos',
        correo: 'intentos.e2e@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    usuarioId = reg.body.usuario.id as number;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'intentos.e2e@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    const cookies = loginRes.headers['set-cookie'] as string[];
    cookieAprendiz = (cookies[0] ?? '').split(';')[0] ?? '';
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  it('20 reenvios concurrentes de finalizacion producen 1 resultado, 1 credito y maximo 1 insignia', async () => {
    // Sembrar temporalmente una insignia sintetica para verificar unicidad en usuario_insignia bajo concurrencia
    const insRows = (await appDataSource.query(
      `INSERT INTO insignia (codigo, nombre, criterio)
       VALUES ('TEST_CONCURRENCIA', 'Insignia Concurrencia', 'primera_actividad')
       RETURNING id`,
    )) as Array<{ id: number }>;
    const insigniaPruebaId = insRows[0].id;

    try {
      const uuidIdempotente = randomUUID();

      // Reenviar el inicio con el mismo UUID devuelve el mismo intento (idempotente)
      const [ini1, ini2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/intentos')
          .set('Cookie', cookieAprendiz)
          .send({ id: uuidIdempotente, unidad_id: unidadNormaMatchId }),
        request(app.getHttpServer())
          .post('/api/v1/intentos')
          .set('Cookie', cookieAprendiz)
          .send({ id: uuidIdempotente, unidad_id: unidadNormaMatchId }),
      ]);
      expect(ini1.status).toBe(201);
      expect(ini2.status).toBe(201);
      expect(ini1.body.id).toBe(uuidIdempotente);
      expect(ini2.body.id).toBe(uuidIdempotente);
      expect(ini1.body.numero).toBe(ini2.body.numero);

      // 1 acierto y 1 fallo -> nota 50 (<80 igual acredita 20 puntos, RN-04)
      const respuestas = await Promise.all(
        Array.from({ length: 20 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/intentos/${uuidIdempotente}/finalizar`)
            .set('Cookie', cookieAprendiz)
            .send({
              asociaciones: {
                'sit-1': 'op-a',
                'sit-2': 'op-c',
              },
            }),
        ),
      );

      for (const r of respuestas) {
        expect(r.status).toBe(200);
        expect(r.body.id).toBe(uuidIdempotente);
        expect(r.body.estado).toBe('finalizado');
        expect(r.body.puntuacion).toBe(50);
      }

      const creditos = (await appDataSource.query(
        `SELECT puntos, intento_origen_id
         FROM credito_unidad
         WHERE usuario_id = $1 AND unidad_id = $2`,
        [usuarioId, unidadNormaMatchId],
      )) as Array<{ puntos: number; intento_origen_id: string }>;
      expect(creditos).toHaveLength(1);
      expect(creditos[0].puntos).toBe(20);
      expect(creditos[0].intento_origen_id).toBe(uuidIdempotente);

      const insignias = (await appDataSource.query(
        `SELECT insignia_id, intento_origen_id
         FROM usuario_insignia
         WHERE usuario_id = $1 AND insignia_id = $2`,
        [usuarioId, insigniaPruebaId],
      )) as Array<{ insignia_id: number; intento_origen_id: string }>;
      expect(insignias).toHaveLength(1);
      expect(insignias[0].intento_origen_id).toBe(uuidIdempotente);

      // Segunda ejecucion de la misma unidad no duplica credito (RN-06)
      const segundoIntento = await request(app.getHttpServer())
        .post('/api/v1/intentos')
        .set('Cookie', cookieAprendiz)
        .send({ unidad_id: unidadNormaMatchId });
      expect(segundoIntento.status).toBe(201);
      expect(segundoIntento.body.numero).toBe(2);

      const finSegundo = await request(app.getHttpServer())
        .post(`/api/v1/intentos/${segundoIntento.body.id}/finalizar`)
        .set('Cookie', cookieAprendiz)
        .send({
          asociaciones: {
            'sit-1': 'op-a',
            'sit-2': 'op-d',
          },
        });
      expect(finSegundo.status).toBe(200);
      expect(finSegundo.body.puntuacion).toBe(100);
      expect(finSegundo.body.credito_otorgado).toBe(false);
      expect(finSegundo.body.puntos_acreditados).toBe(0);
    } finally {
      await appDataSource.query(
        `DELETE FROM usuario_insignia WHERE usuario_id = $1 AND insignia_id = $2`,
        [usuarioId, insigniaPruebaId],
      );
      await appDataSource.query(`DELETE FROM insignia WHERE id = $1`, [
        insigniaPruebaId,
      ]);
    }
  });

  it('nueva version publicada con intento abierto conserva version y explicacion originales (PA-03)', async () => {
    const abrir = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({ unidad_id: unidadVersionadaId });
    expect(abrir.status).toBe(201);
    expect(abrir.body.version_id).toBe(versionOriginalId);
    const intentoId = abrir.body.id as string;

    // Se publica V2 de la misma unidad mientras el intento sigue abierto
    const contenidoV2 = {
      situaciones: [
        {
          id: 'sit-v1',
          enunciado: 'Enunciado cambiado V2',
          opciones: [
            { id: 'op-1', texto: 'Opción 1 V2' },
            { id: 'op-2', texto: 'Opción 2 V2' },
          ],
          respuesta_correcta: 'op-2',
          explicacion: 'Explicación NUEVA V2',
        },
      ],
    };

    const v2Rows = (await appDataSource.query(
      `INSERT INTO version_unidad
         (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
       VALUES ($1, 2, 'NormaMatch V2', 'Desc V2', $2, 'basico', 'publicado', 1, $3::jsonb, CURRENT_TIMESTAMP)
       RETURNING id`,
      [unidadVersionadaId, temaId, JSON.stringify(contenidoV2)],
    )) as Array<{ id: string }>;
    await appDataSource.query(
      `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
      [Number(v2Rows[0].id), unidadVersionadaId],
    );

    // Reanudar conserva version V1
    const reanudar = await request(app.getHttpServer())
      .get(`/api/v1/intentos/${intentoId}`)
      .set('Cookie', cookieAprendiz);
    expect(reanudar.status).toBe(200);
    expect(reanudar.body.version_id).toBe(versionOriginalId);
    expect(reanudar.body.version_numero).toBe(1);
    expect(reanudar.body.contenido.situaciones[0].enunciado).toBe(
      'Enunciado V1',
    );

    // Finalizar evalua con la clave de V1 (op-1) y conserva la explicacion de V1
    const finalizar = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${intentoId}/finalizar`)
      .set('Cookie', cookieAprendiz)
      .send({ asociaciones: { 'sit-v1': 'op-1' } });
    expect(finalizar.status).toBe(200);
    expect(finalizar.body.puntuacion).toBe(100);
    expect(finalizar.body.retroalimentacion.situaciones[0].explicacion).toBe(
      'Explicación original V1',
    );

    const resultado = await request(app.getHttpServer())
      .get(`/api/v1/intentos/${intentoId}/resultado`)
      .set('Cookie', cookieAprendiz);
    expect(resultado.status).toBe(200);
    expect(resultado.body.version_id).toBe(versionOriginalId);
    expect(resultado.body.retroalimentacion.situaciones[0].explicacion).toBe(
      'Explicación original V1',
    );
  });

  it('reanudacion, revision optimista 409, CasoTech, gamificacion e historial sin recorrido', async () => {
    // Aprende: paso parcial -> 409 con revision vieja -> reanudar -> finalizar
    const iniAprende = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({ unidad_id: unidadAprendeId });
    expect(iniAprende.status).toBe(201);
    const aprendeId = iniAprende.body.id as string;

    const paso1 = await request(app.getHttpServer())
      .patch(`/api/v1/intentos/${aprendeId}/paso`)
      .set('Cookie', cookieAprendiz)
      .send({ revision: 1, seccion_id: 's1' });
    expect(paso1.status).toBe(200);
    expect(paso1.body.revision).toBe(2);
    expect(paso1.body.recorrido.secciones_visitadas).toEqual(['s1']);

    const conflicto = await request(app.getHttpServer())
      .patch(`/api/v1/intentos/${aprendeId}/paso`)
      .set('Cookie', cookieAprendiz)
      .send({ revision: 1, seccion_id: 's2' });
    expect(conflicto.status).toBe(409);
    expect(conflicto.body.error.codigo).toBe('REVISION_DESACTUALIZADA');

    const reanudarAprende = await request(app.getHttpServer())
      .get(`/api/v1/intentos/${aprendeId}`)
      .set('Cookie', cookieAprendiz);
    expect(reanudarAprende.status).toBe(200);
    expect(reanudarAprende.body.recorrido.secciones_visitadas).toEqual(['s1']);

    const finAprende = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${aprendeId}/finalizar`)
      .set('Cookie', cookieAprendiz)
      .send({ revision: 2, seccion_id: 's2', confirmado: true });
    expect(finAprende.status).toBe(200);
    expect(finAprende.body.puntuacion).toBeNull();
    expect(finAprende.body.puntos_acreditados).toBe(10);

    // CasoTech: avance por etapas controlado por servidor y rechazo de puntuacion del cliente
    const iniCaso = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({ unidad_id: unidadCasoTechId });
    expect(iniCaso.status).toBe(201);
    const casoId = iniCaso.body.id as string;

    const pasoCaso1 = await request(app.getHttpServer())
      .patch(`/api/v1/intentos/${casoId}/paso`)
      .set('Cookie', cookieAprendiz)
      .send({ revision: 1, alternativa_id: 'alt-1' });
    expect(pasoCaso1.status).toBe(200);
    expect(pasoCaso1.body.recorrido.etapa_actual_id).toBe('et-2');

    const intentoNotaCliente = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${casoId}/finalizar`)
      .set('Cookie', cookieAprendiz)
      .send({ puntuacion: 100 });
    expect(intentoNotaCliente.status).toBe(400);

    // Decision 1 (2) + Decision 2 (1) => 100 * 3 / (2 * 2) = 75
    const finCaso = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${casoId}/finalizar`)
      .set('Cookie', cookieAprendiz)
      .send({ revision: 2, alternativa_id: 'alt-2' });
    expect(finCaso.status).toBe(200);
    expect(finCaso.body.puntuacion).toBe(75);
    expect(finCaso.body.puntos_acreditados).toBe(20);
    expect(finCaso.body.insignias_concedidas).toEqual([]);

    // Gamificacion derivada: 20 (NormaMatch) + 20 (NormaMatch versionada) + 10 (Aprende) + 20 (CasoTech) = 70
    const puntosRes = await request(app.getHttpServer())
      .get('/api/v1/gamificacion/me/puntos')
      .set('Cookie', cookieAprendiz);
    expect(puntosRes.status).toBe(200);
    expect(puntosRes.body.puntos_totales).toBe(70);
    expect(puntosRes.body.unidades_acreditadas).toBe(4);

    const rangoRes = await request(app.getHttpServer())
      .get('/api/v1/gamificacion/me/rango')
      .set('Cookie', cookieAprendiz);
    expect(rangoRes.status).toBe(200);
    expect(rangoRes.body.rango).toBe('Inicial');
    expect(rangoRes.body.puntos_faltantes).toBe(30);

    const insigniasRes = await request(app.getHttpServer())
      .get('/api/v1/gamificacion/me/insignias')
      .set('Cookie', cookieAprendiz);
    expect(insigniasRes.status).toBe(200);
    expect(insigniasRes.body).toEqual([]);

    // Historial paginado sin recorrido
    const historial1 = await request(app.getHttpServer())
      .get('/api/v1/intentos/me/historial')
      .set('Cookie', cookieAprendiz)
      .query({ limit: 2 });
    expect(historial1.status).toBe(200);
    expect(historial1.body.items).toHaveLength(2);
    expect(historial1.body.siguiente_cursor).toBeTruthy();
    for (const item of historial1.body.items as Array<Record<string, unknown>>) {
      expect(item.recorrido).toBeUndefined();
    }

    const historial2 = await request(app.getHttpServer())
      .get('/api/v1/intentos/me/historial')
      .set('Cookie', cookieAprendiz)
      .query({ limit: 2, cursor: historial1.body.siguiente_cursor });
    expect(historial2.status).toBe(200);
    expect(historial2.body.items.length).toBeGreaterThanOrEqual(2);
  });
});
