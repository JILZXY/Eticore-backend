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

describe('Catalog y Validation (e2e con PostgreSQL 18.6)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

  let temaId: number;
  let rutaId: number;
  let unidadAprendePublicaId: number;
  let unidadNormaMatchPublicaId: number;
  let unidadCasoTechPublicaId: number;
  let unidadBorradorId: number;
  let unidadEnRevisionId: number;
  let cookieAprendiz: string;

  beforeAll(async () => {
    testDb = await startEphemeralPostgres();

    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = testDb.url;
    process.env.AUTH_DATABASE_URL = testDb.url;
    process.env.MIGRATION_DATABASE_URL = testDb.url;
    process.env.DB_POOL_MAX = '5';
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

    // Seed sintetico minimo exclusivamente para pruebas E2E
    const temas = (await appDataSource.query(
      `INSERT INTO tema (nombre, descripcion, activo)
       VALUES ('Ética Digital', 'Tema de prueba', TRUE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    temaId = temas[0].id;

    const fuentes = (await appDataSource.query(
      `INSERT INTO fuente (nombre) VALUES ('Fuente de Prueba') RETURNING id`,
    )) as Array<{ id: number }>;
    const fuenteVersiones = (await appDataSource.query(
      `INSERT INTO fuente_version (fuente_id, titulo, autor_organismo, url, fecha_o_version)
       VALUES ($1, 'Guía Sintética', 'Organismo Test', 'https://example.invalid/doc', '2026')
       RETURNING id`,
      [fuentes[0].id],
    )) as Array<{ id: string }>;
    const fuenteVersionId = fuenteVersiones[0].id;

    const crearUnidad = async (params: {
      tipo: 'aprende' | 'normamatch' | 'casotech';
      muestraPublica: boolean;
      titulo: string;
      descripcion: string;
      dificultad: 'basico' | 'intermedio' | 'especializado';
      estado: 'borrador' | 'en_revision' | 'publicado';
      contenido: Record<string, unknown>;
      conFuente?: boolean;
    }): Promise<number> => {
      const unidades = (await appDataSource.query(
        `INSERT INTO unidad (tipo, activa, muestra_publica)
         VALUES ($1, TRUE, $2)
         RETURNING id`,
        [params.tipo, params.muestraPublica],
      )) as Array<{ id: number }>;
      const uId = unidades[0].id;

      const publicadaEn =
        params.estado === 'publicado' ? new Date() : null;

      const versiones = (await appDataSource.query(
        `INSERT INTO version_unidad
           (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
         VALUES ($1, 1, $2, $3, $4, $5, $6, 1, $7::jsonb, $8)
         RETURNING id`,
        [
          uId,
          params.titulo,
          params.descripcion,
          temaId,
          params.dificultad,
          params.estado,
          JSON.stringify(params.contenido),
          publicadaEn,
        ],
      )) as Array<{ id: string }>;
      const vId = versiones[0].id;

      if (params.conFuente) {
        await appDataSource.query(
          `INSERT INTO unidad_fuente (version_id, clave_local, fuente_version_id, revisada_en)
           VALUES ($1, 'REF1', $2, '2026-11-17')`,
          [vId, fuenteVersionId],
        );
      }

      if (params.estado === 'publicado') {
        await appDataSource.query(
          `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
          [vId, uId],
        );
      }

      return uId;
    };

    unidadAprendePublicaId = await crearUnidad({
      tipo: 'aprende',
      muestraPublica: true,
      titulo: 'Introducción a la Ética en TI',
      descripcion: 'Fundamentos sobre privacidad y protección de datos.',
      dificultad: 'basico',
      estado: 'publicado',
      conFuente: true,
      contenido: {
        objetivo: 'Comprender conceptos clave.',
        secciones: [
          {
            id: 's1',
            orden: 1,
            titulo: 'Sección 1',
            cuerpo: 'Contenido sintetico.',
            referencias_locales: ['REF1'],
          },
        ],
        ejemplo: 'Ejemplo sintetico.',
      },
    });

    unidadNormaMatchPublicaId = await crearUnidad({
      tipo: 'normamatch',
      muestraPublica: false,
      titulo: 'Asociación de Principios de Privacidad',
      descripcion: 'Ejercicio de asociación normativa.',
      dificultad: 'intermedio',
      estado: 'publicado',
      contenido: {
        clave_asociacion: { 'sit-1': 'op-1' },
        situaciones: [
          {
            id: 'sit-1',
            enunciado: 'Solicitud sin minimización',
            opciones: [
              { id: 'op-1', texto: 'Minimización de datos' },
              { id: 'op-2', texto: 'Portabilidad' },
            ],
            respuesta_correcta: 'op-1',
            explicacion: 'Se recolectan solo los datos indispensables.',
          },
        ],
      },
    });

    unidadCasoTechPublicaId = await crearUnidad({
      tipo: 'casotech',
      muestraPublica: false,
      titulo: 'Decisión en Arquitectura Segura',
      descripcion: 'Caso práctico de toma de decisiones.',
      dificultad: 'especializado',
      estado: 'publicado',
      contenido: {
        etapa_inicial_id: 'et-1',
        etapas: [
          {
            id: 'et-1',
            titulo: 'Etapa inicial',
            terminal: false,
            alternativas: [
              {
                id: 'alt-1',
                texto: 'Cifrar secretos fuera de BD',
                ponderacion: 2,
                siguiente_etapa_id: 'et-2',
              },
              {
                id: 'alt-2',
                texto: 'Dejar texto plano',
                ponderacion: 0,
                siguiente_etapa_id: 'et-2',
              },
            ],
          },
          {
            id: 'et-2',
            titulo: 'Conclusión',
            terminal: true,
          },
        ],
      },
    });

    unidadBorradorId = await crearUnidad({
      tipo: 'aprende',
      muestraPublica: true,
      titulo: 'Borrador Oculto',
      descripcion: 'No debe aparecer en catálogo ni muestra.',
      dificultad: 'basico',
      estado: 'borrador',
      contenido: {
        objetivo: 'Borrador.',
        secciones: [{ id: 's1', orden: 1, titulo: 'S1', cuerpo: 'C1' }],
        ejemplo: 'Ej.',
      },
    });

    unidadEnRevisionId = await crearUnidad({
      tipo: 'aprende',
      muestraPublica: false,
      titulo: 'En Revisión Oculto',
      descripcion: 'Tampoco debe aparecer.',
      dificultad: 'basico',
      estado: 'en_revision',
      contenido: {
        objetivo: 'Revisión.',
        secciones: [{ id: 's1', orden: 1, titulo: 'S1', cuerpo: 'C1' }],
        ejemplo: 'Ej.',
      },
    });

    const rutas = (await appDataSource.query(
      `INSERT INTO ruta (nombre, activa) VALUES ('General', TRUE) RETURNING id`,
    )) as Array<{ id: number }>;
    rutaId = rutas[0].id;
    const versionRutas = (await appDataSource.query(
      `INSERT INTO version_ruta (ruta_id, numero, publicada_en)
       VALUES ($1, 1, CURRENT_TIMESTAMP) RETURNING id`,
      [rutaId],
    )) as Array<{ id: string }>;
    const versionRutaId = versionRutas[0].id;
    await appDataSource.query(
      `UPDATE ruta SET version_actual_id = $1 WHERE id = $2`,
      [versionRutaId, rutaId],
    );
    await appDataSource.query(
      `INSERT INTO ruta_unidad (ruta_version_id, unidad_id, orden, obligatoria)
       VALUES ($1, $2, 1, TRUE), ($1, $3, 2, TRUE)`,
      [versionRutaId, unidadAprendePublicaId, unidadNormaMatchPublicaId],
    );

    // Registrar y loguear un aprendiz para endpoints autenticados
    const claveSintetica = 'clave catalogo e2e segura 2026';
    await request(app.getHttpServer()).post('/api/v1/auth/registro').send({
      nombre_visualizacion: 'Aprendiz Catálogo',
      correo: 'catalogo.aprendiz@eticore.edu.mx',
      contrasena: claveSintetica,
    });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'catalogo.aprendiz@eticore.edu.mx',
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

  it('catalogo solo muestra unidades publicadas, filtra y pagina por cursor sin cargar contenido', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/catalogo');
    expect(res.status).toBe(200);

    const ids = (res.body.items as Array<{ id: number }>).map((i) => i.id);
    expect(ids).toEqual([
      unidadAprendePublicaId,
      unidadNormaMatchPublicaId,
      unidadCasoTechPublicaId,
    ]);
    expect(ids).not.toContain(unidadBorradorId);
    expect(ids).not.toContain(unidadEnRevisionId);

    for (const item of res.body.items as Array<Record<string, unknown>>) {
      expect(item.contenido).toBeUndefined();
    }

    // Busqueda sin acentos/mayusculas + filtro por ruta
    const resBusqueda = await request(app.getHttpServer())
      .get('/api/v1/catalogo')
      .query({ q: 'ETICA proteccion', ruta_id: rutaId, tema_id: temaId });
    expect(resBusqueda.status).toBe(200);
    expect(resBusqueda.body.items).toHaveLength(1);
    expect(resBusqueda.body.items[0].id).toBe(unidadAprendePublicaId);

    // Paginacion por cursor
    const pag1 = await request(app.getHttpServer())
      .get('/api/v1/catalogo')
      .query({ limit: 2 });
    expect(pag1.status).toBe(200);
    expect(pag1.body.items).toHaveLength(2);
    expect(pag1.body.siguiente_cursor).toBeTruthy();

    const pag2 = await request(app.getHttpServer())
      .get('/api/v1/catalogo')
      .query({ limit: 2, cursor: pag1.body.siguiente_cursor });
    expect(pag2.status).toBe(200);
    expect(pag2.body.items).toHaveLength(1);
    expect(pag2.body.items[0].id).toBe(unidadCasoTechPublicaId);
    expect(pag2.body.siguiente_cursor).toBeNull();
  });

  it('muestra publica funciona sin cuenta solo si muestra_publica=true y sin crear sesion ni intento', async () => {
    const sesionesAntes = (await appDataSource.query(
      `SELECT count(*)::int AS total FROM sesion`,
    )) as Array<{ total: number }>;

    const ok = await request(app.getHttpServer()).get(
      `/api/v1/catalogo/unidades/${unidadAprendePublicaId}/muestra`,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.id).toBe(unidadAprendePublicaId);
    expect(ok.body.fuentes).toHaveLength(1);
    expect(ok.body.fuentes[0].clave_local).toBe('REF1');

    const sesionesDespues = (await appDataSource.query(
      `SELECT count(*)::int AS total FROM sesion`,
    )) as Array<{ total: number }>;
    const intentos = (await appDataSource.query(
      `SELECT count(*)::int AS total FROM intento`,
    )) as Array<{ total: number }>;
    expect(sesionesDespues[0].total).toBe(sesionesAntes[0].total);
    expect(intentos[0].total).toBe(0);

    // No permite unidades sin muestra_publica ni borradores
    const noMuestra = await request(app.getHttpServer()).get(
      `/api/v1/catalogo/unidades/${unidadNormaMatchPublicaId}/muestra`,
    );
    expect(noMuestra.status).toBe(404);

    const borrador = await request(app.getHttpServer()).get(
      `/api/v1/catalogo/unidades/${unidadBorradorId}/muestra`,
    );
    expect(borrador.status).toBe(404);
  });

  it('al abrir actividades proyecta enunciados y opciones pero nunca claves ni ponderaciones', async () => {
    const sinSesion = await request(app.getHttpServer()).get(
      `/api/v1/catalogo/unidades/${unidadNormaMatchPublicaId}`,
    );
    expect(sinSesion.status).toBe(401);

    const resNorma = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadNormaMatchPublicaId}`)
      .set('Cookie', cookieAprendiz);
    expect(resNorma.status).toBe(200);
    expect(resNorma.body.contenido.clave_asociacion).toBeUndefined();
    const sit = resNorma.body.contenido.situaciones[0] as Record<
      string,
      unknown
    >;
    expect(sit.respuesta_correcta).toBeUndefined();
    expect(sit.explicacion).toBeUndefined();
    expect(sit.opciones).toHaveLength(2);

    const resCaso = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadCasoTechPublicaId}`)
      .set('Cookie', cookieAprendiz);
    expect(resCaso.status).toBe(200);
    const alt = resCaso.body.contenido.etapas[0].alternativas[0] as Record<
      string,
      unknown
    >;
    expect(alt.ponderacion).toBeUndefined();
    expect(alt.texto).toBe('Cifrar secretos fuera de BD');
  });
});
