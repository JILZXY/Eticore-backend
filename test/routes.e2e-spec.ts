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
  type EphemeralTestDb,
  startEphemeralPostgres,
} from './helpers/postgres-test-db.js';

describe('Routes (e2e con PostgreSQL 18.6)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

  let unidad1Id: number;
  let unidad2Id: number;
  let unidad3Id: number;
  let unidadOpcionalId: number;

  let rutaAId: number;
  let rutaBId: number;
  let rutaVaciaId: number;
  let versionRutaA1Id: number;

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
       VALUES ('Ética en Rutas', 'Tema de prueba', TRUE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    const temaId = temas[0].id;

    const crearUnidadAprende = async (titulo: string): Promise<number> => {
      const u = (await appDataSource.query(
        `INSERT INTO unidad (tipo, activa, muestra_publica)
         VALUES ('aprende', TRUE, FALSE)
         RETURNING id`,
      )) as Array<{ id: number }>;
      const uId = u[0].id;

      const contenido = {
        objetivo: `Objetivo ${titulo}`,
        secciones: [{ id: 's1', orden: 1, titulo: 'S1', cuerpo: 'Cuerpo' }],
        ejemplo: 'Ejemplo',
      };
      const v = (await appDataSource.query(
        `INSERT INTO version_unidad
           (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
         VALUES ($1, 1, $2, 'Desc', $3, 'basico', 'publicado', 1, $4::jsonb, CURRENT_TIMESTAMP)
         RETURNING id`,
        [uId, titulo, temaId, JSON.stringify(contenido)],
      )) as Array<{ id: string }>;

      await appDataSource.query(
        `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
        [Number(v[0].id), uId],
      );
      return uId;
    };

    unidad1Id = await crearUnidadAprende('Unidad 1');
    unidad2Id = await crearUnidadAprende('Unidad 2');
    unidad3Id = await crearUnidadAprende('Unidad 3');
    unidadOpcionalId = await crearUnidadAprende('Unidad Opcional');

    const crearRuta = async (
      nombre: string,
      unidades: Array<{ unidadId: number; orden: number; obligatoria: boolean }>,
    ): Promise<{ rutaId: number; versionId: number }> => {
      const r = (await appDataSource.query(
        `INSERT INTO ruta (nombre, activa) VALUES ($1, TRUE) RETURNING id`,
        [nombre],
      )) as Array<{ id: number }>;
      const rId = r[0].id;

      const vr = (await appDataSource.query(
        `INSERT INTO version_ruta (ruta_id, numero, publicada_en)
         VALUES ($1, 1, CURRENT_TIMESTAMP) RETURNING id`,
        [rId],
      )) as Array<{ id: string }>;
      const vrId = Number(vr[0].id);

      await appDataSource.query(
        `UPDATE ruta SET version_actual_id = $1 WHERE id = $2`,
        [vrId, rId],
      );

      for (const item of unidades) {
        await appDataSource.query(
          `INSERT INTO ruta_unidad (ruta_version_id, unidad_id, orden, obligatoria)
           VALUES ($1, $2, $3, $4)`,
          [vrId, item.unidadId, item.orden, item.obligatoria],
        );
      }

      return { rutaId: rId, versionId: vrId };
    };

    const rA = await crearRuta('General', [
      { unidadId: unidad1Id, orden: 1, obligatoria: true },
      { unidadId: unidad2Id, orden: 2, obligatoria: true },
      { unidadId: unidadOpcionalId, orden: 3, obligatoria: false },
    ]);
    rutaAId = rA.rutaId;
    versionRutaA1Id = rA.versionId;

    rutaBId = (
      await crearRuta('TI', [{ unidadId: unidad3Id, orden: 1, obligatoria: true }])
    ).rutaId;

    rutaVaciaId = (await crearRuta('Ruta Vacía', [])).rutaId;

    const claveSintetica = 'clave routes e2e segura 2026';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Aprendiz Rutas',
        correo: 'rutas.e2e@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    usuarioId = reg.body.usuario.id as number;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'rutas.e2e@eticore.edu.mx',
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

  it('cambiar de ruta conserva avance por separado, mantiene version inscrita y no concede roles (RN-08, RN-23)', async () => {
    const listado = await request(app.getHttpServer()).get('/api/v1/rutas');
    expect(listado.status).toBe(200);
    expect(listado.body).toHaveLength(3);

    // 1) Elegir Ruta A
    const elegirA = await request(app.getHttpServer())
      .post(`/api/v1/rutas/${rutaAId}/elegir`)
      .set('Cookie', cookieAprendiz);
    expect(elegirA.status).toBe(200);
    expect(elegirA.body.ruta_version_id).toBe(versionRutaA1Id);

    // Completar Unidad 1 (obligatoria) y Unidad Opcional
    for (const uId of [unidad1Id, unidadOpcionalId]) {
      const ini = await request(app.getHttpServer())
        .post('/api/v1/intentos')
        .set('Cookie', cookieAprendiz)
        .send({ unidad_id: uId });
      expect(ini.status).toBe(201);

      const fin = await request(app.getHttpServer())
        .post(`/api/v1/intentos/${ini.body.id}/finalizar`)
        .set('Cookie', cookieAprendiz)
        .send({ seccion_id: 's1', confirmado: true });
      expect(fin.status).toBe(200);
    }

    const progA = await request(app.getHttpServer())
      .get('/api/v1/rutas/me/progreso')
      .set('Cookie', cookieAprendiz);
    expect(progA.status).toBe(200);
    expect(progA.body.total_obligatorias).toBe(2);
    expect(progA.body.completadas_obligatorias).toBe(1);
    expect(progA.body.porcentaje).toBe(50);

    // 2) Cambiar a Ruta B sin migrar ni borrar la inscripcion anterior
    const cambiarB = await request(app.getHttpServer())
      .post('/api/v1/rutas/me/cambiar')
      .set('Cookie', cookieAprendiz)
      .send({ ruta_id: rutaBId });
    expect(cambiarB.status).toBe(200);
    expect(cambiarB.body.ruta_id).toBe(rutaBId);
    expect(cambiarB.body.migrada_de_id).toBeNull();

    const progB = await request(app.getHttpServer())
      .get('/api/v1/rutas/me/progreso')
      .set('Cookie', cookieAprendiz);
    expect(progB.status).toBe(200);
    expect(progB.body.ruta_id).toBe(rutaBId);
    expect(progB.body.porcentaje).toBe(0);
    expect(progB.body.inscripciones).toHaveLength(2);

    // La inscripcion en Ruta A sigue conservando su 50% por separado
    const progAConservado = await request(app.getHttpServer())
      .get('/api/v1/rutas/me/progreso')
      .set('Cookie', cookieAprendiz)
      .query({ ruta_id: rutaAId });
    expect(progAConservado.status).toBe(200);
    expect(progAConservado.body.porcentaje).toBe(50);

    // 3) Se publica V2 de Ruta A: la inscripcion existente sigue evaluando contra V1
    const v2Rows = (await appDataSource.query(
      `INSERT INTO version_ruta (ruta_id, numero, publicada_en)
       VALUES ($1, 2, CURRENT_TIMESTAMP) RETURNING id`,
      [rutaAId],
    )) as Array<{ id: string }>;
    const v2Id = Number(v2Rows[0].id);
    await appDataSource.query(
      `UPDATE ruta SET version_actual_id = $1 WHERE id = $2`,
      [v2Id, rutaAId],
    );
    await appDataSource.query(
      `INSERT INTO ruta_unidad (ruta_version_id, unidad_id, orden, obligatoria)
       VALUES ($1, $2, 1, TRUE), ($1, $3, 2, TRUE), ($1, $4, 3, TRUE)`,
      [v2Id, unidad1Id, unidad2Id, unidad3Id],
    );

    const progATrasV2 = await request(app.getHttpServer())
      .get('/api/v1/rutas/me/progreso')
      .set('Cookie', cookieAprendiz)
      .query({ ruta_id: rutaAId });
    expect(progATrasV2.status).toBe(200);
    expect(progATrasV2.body.ruta_version_id).toBe(versionRutaA1Id);
    expect(progATrasV2.body.version_numero).toBe(1);
    expect(progATrasV2.body.total_obligatorias).toBe(2);
    expect(progATrasV2.body.porcentaje).toBe(50);

    // Verificar RN-08: cambiar de ruta no otorga roles extra
    const perfil = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', cookieAprendiz);
    expect(perfil.body.roles).toEqual(['APRENDIZ']);
  });

  it('ruta vacia devuelve "Sin actividades" y desactivar unidad conserva credito previo', async () => {
    const elegirVacia = await request(app.getHttpServer())
      .post(`/api/v1/rutas/${rutaVaciaId}/elegir`)
      .set('Cookie', cookieAprendiz);
    expect(elegirVacia.status).toBe(200);

    const progVacia = await request(app.getHttpServer())
      .get('/api/v1/rutas/me/progreso')
      .set('Cookie', cookieAprendiz);
    expect(progVacia.status).toBe(200);
    expect(progVacia.body.estado).toBe('Sin actividades');
    expect(progVacia.body.total_obligatorias).toBe(0);
    expect(progVacia.body.porcentaje).toBeNull();

    // Desactivar unidad 1 (completada) y unidad 2 (pendiente) en Ruta A
    await appDataSource.query(
      `UPDATE unidad SET activa = FALSE WHERE id IN ($1, $2)`,
      [unidad1Id, unidad2Id],
    );

    const puntos = await request(app.getHttpServer())
      .get('/api/v1/gamificacion/me/puntos')
      .set('Cookie', cookieAprendiz);
    expect(puntos.status).toBe(200);
    expect(puntos.body.puntos_totales).toBe(20);
    expect(puntos.body.unidades_acreditadas).toBe(2);

    const creditosEnBd = (await appDataSource.query(
      `SELECT count(*)::int AS total FROM credito_unidad WHERE usuario_id = $1`,
      [usuarioId],
    )) as Array<{ total: number }>;
    expect(creditosEnBd[0].total).toBe(2);

    const progAConRetiradas = await request(app.getHttpServer())
      .get('/api/v1/rutas/me/progreso')
      .set('Cookie', cookieAprendiz)
      .query({ ruta_id: rutaAId });
    expect(progAConRetiradas.status).toBe(200);
    expect(progAConRetiradas.body.total_obligatorias).toBe(2);
    expect(progAConRetiradas.body.completadas_obligatorias).toBe(1);
    expect(progAConRetiradas.body.porcentaje).toBe(50);
  });
});
