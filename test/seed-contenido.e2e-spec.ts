import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { limpiarContenidoSeed } from '../src/database/seeds/content-seed-guard.js';
import { runContentSeed } from '../src/database/seeds/content.seed.js';
import {
  type EphemeralTestDb,
  startEphemeralPostgres,
} from './helpers/postgres-test-db.js';

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

describe('Seed de contenido sintético y ejecución de módulos (e2e con PostgreSQL 18.6)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

  beforeAll(async () => {
    testDb = await startEphemeralPostgres();

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = testDb.url;
    process.env.AUTH_DATABASE_URL = testDb.url;
    process.env.AUDIT_DATABASE_URL = testDb.url;
    process.env.MIGRATION_DATABASE_URL = testDb.url;
    process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    process.env.SESSION_COOKIE_SECURE = 'false';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    appDataSource = app.get(DataSource);
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  }, 60_000);

  it('se niega a correr si NODE_ENV=production', async () => {
    await expect(
      runContentSeed(appDataSource, {
        NODE_ENV: 'production',
      }),
    ).rejects.toThrow(/SEED_PRODUCCION_PROHIBIDO/);

    await expect(
      limpiarContenidoSeed(appDataSource, {
        NODE_ENV: 'production',
      }),
    ).rejects.toThrow(/SEED_PRODUCCION_PROHIBIDO/);
  });

  it('corre el seed dos veces sin duplicar temas, fuentes, rutas, unidades ni versiones', async () => {
    const passwordSintetica = `ClaveEditorSeed-${randomBytes(8).toString('hex')}!`;
    const envSeed: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      SEED_EDITOR_PASSWORD: passwordSintetica,
      ETICORE_API_DOMAIN: 'seed.eticore.example.invalid',
    };

    const primeraEjecucion = await runContentSeed(appDataSource, envSeed);
    expect(primeraEjecucion.revisorCreado).toBe(true);
    expect(primeraEjecucion.temasTotal).toBe(3);
    expect(primeraEjecucion.fuentesVersionTotal).toBe(6);
    expect(primeraEjecucion.unidadesPublicadasNuevas).toBe(8);
    expect(primeraEjecucion.unidadesOmitidasYaPublicadas).toBe(0);
    expect(primeraEjecucion.rutasSincronizadas).toBe(2);

    const contarTablas = async () => {
      const filas = (await appDataSource.query(`
        SELECT
          (SELECT COUNT(*)::int FROM tema) AS temas,
          (SELECT COUNT(*)::int FROM fuente) AS fuentes,
          (SELECT COUNT(*)::int FROM fuente_version) AS fuentes_version,
          (SELECT COUNT(*)::int FROM unidad) AS unidades,
          (SELECT COUNT(*)::int FROM version_unidad) AS versiones,
          (SELECT COUNT(*)::int FROM revision_editorial) AS revisiones,
          (SELECT COUNT(*)::int FROM unidad_fuente) AS unidad_fuentes,
          (SELECT COUNT(*)::int FROM ruta) AS rutas,
          (SELECT COUNT(*)::int FROM version_ruta) AS versiones_ruta,
          (SELECT COUNT(*)::int FROM ruta_unidad) AS ruta_unidades,
          (SELECT COUNT(*)::int FROM usuario) AS usuarios
      `)) as Array<Record<string, number>>;
      return filas[0];
    };

    const conteo1 = await contarTablas();
    expect(conteo1.temas).toBe(3);
    expect(conteo1.unidades).toBe(8);
    expect(conteo1.versiones).toBe(8);
    expect(conteo1.rutas).toBe(2);
    expect(conteo1.versiones_ruta).toBe(2);
    expect(conteo1.usuarios).toBe(1);

    // Segunda ejecución: reutiliza el ADMIN_CONTENIDO existente y salta lo ya publicado
    const segundaEjecucion = await runContentSeed(appDataSource, {
      NODE_ENV: 'test',
    });
    expect(segundaEjecucion.revisorCreado).toBe(false);
    expect(segundaEjecucion.revisorId).toBe(primeraEjecucion.revisorId);
    expect(segundaEjecucion.unidadesPublicadasNuevas).toBe(0);
    expect(segundaEjecucion.unidadesOmitidasYaPublicadas).toBe(8);

    const conteo2 = await contarTablas();
    expect(conteo2).toEqual(conteo1);
  });

  it('GET /api/v1/catalogo y GET /api/v1/rutas muestran las unidades publicadas y las 2 rutas', async () => {
    const resCatalogo = await request(app.getHttpServer())
      .get('/api/v1/catalogo')
      .expect(200);

    const items = resCatalogo.body.items as Array<{
      unidad_id: number;
      tipo: string;
      titulo: string;
      descripcion: string;
      contenido?: unknown;
    }>;

    expect(items).toHaveLength(8);
    expect(items.filter((i) => i.tipo === 'aprende')).toHaveLength(3);
    expect(items.filter((i) => i.tipo === 'normamatch')).toHaveLength(3);
    expect(items.filter((i) => i.tipo === 'casotech')).toHaveLength(2);

    for (const item of items) {
      expect(item.contenido).toBeUndefined();
      expect(item.descripcion).toContain(
        '[CONTENIDO DE EJEMPLO SINTÉTICO - ETICORE SEED]',
      );
    }

    const resRutas = await request(app.getHttpServer())
      .get('/api/v1/rutas')
      .expect(200);

    const rutas = resRutas.body as Array<{
      id: number;
      nombre: string;
      unidades_obligatorias: number;
    }>;
    expect(rutas.map((r) => r.nombre).sort()).toEqual(['General', 'TI']);
    for (const r of rutas) {
      expect(r.unidades_obligatorias).toBeGreaterThan(0);
    }
  });

  it('permite abrir y finalizar una lección de cada módulo (Aprende, NormaMatch y CasoTech)', async () => {
    const passwordAprendiz = `AprendizSeedTest-${randomBytes(8).toString('hex')}!`;
    const correoAprendiz = `aprendiz.seed.${randomBytes(4).toString('hex')}@seed.eticore.example.invalid`;

    await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Aprendiz Prueba Seed',
        correo: correoAprendiz,
        contrasena: passwordAprendiz,
      })
      .expect(201);

    const resLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: correoAprendiz,
        contrasena: passwordAprendiz,
      })
      .expect(200);

    const cookieAprendiz = extraerCookieSid(resLogin.headers['set-cookie']);

    const resCatalogo = await request(app.getHttpServer())
      .get('/api/v1/catalogo')
      .set('Cookie', cookieAprendiz)
      .expect(200);

    const items = resCatalogo.body.items as Array<{
      id: number;
      tipo: string;
      titulo: string;
    }>;

    const unidadAprende = items.find((i) => i.titulo === 'Minimización de datos');
    const unidadNormaMatch = items.find(
      (i) => i.titulo === 'Relaciona cada situación con su principio',
    );
    const unidadCasoTech = items.find((i) => i.titulo === 'Un correo sospechoso');

    expect(unidadAprende).toBeDefined();
    expect(unidadNormaMatch).toBeDefined();
    expect(unidadCasoTech).toBeDefined();

    // 1. Abrir y finalizar Aprende
    const resDetalleAprende = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadAprende!.id}`)
      .set('Cookie', cookieAprendiz)
      .expect(200);

    expect(resDetalleAprende.body.fuentes.length).toBeGreaterThanOrEqual(1);
    const seccionesAprende = resDetalleAprende.body.contenido
      .secciones as Array<{ id: string }>;

    const intentoAprendeId = randomUUID();
    const resCrearAprende = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({
        id: intentoAprendeId,
        unidad_id: unidadAprende!.id,
      })
      .expect(201);

    const resFinAprende = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${intentoAprendeId}/finalizar`)
      .set('Cookie', cookieAprendiz)
      .send({
        revision: resCrearAprende.body.revision,
        secciones_visitadas: seccionesAprende.map((s) => s.id),
        confirmado: true,
      })
      .expect(200);

    expect(resFinAprende.body.estado).toBe('finalizado');
    expect(resFinAprende.body.puntuacion).toBeNull();
    expect(resFinAprende.body.credito_otorgado).toBe(true);
    expect(resFinAprende.body.puntos_acreditados).toBe(10);

    // 2. Abrir y finalizar NormaMatch
    const resDetalleNorma = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadNormaMatch!.id}`)
      .set('Cookie', cookieAprendiz)
      .expect(200);

    const situacionesNorma = resDetalleNorma.body.contenido
      .situaciones as Array<{
      id: string;
      respuesta_correcta?: string;
    }>;
    for (const sit of situacionesNorma) {
      expect(sit.respuesta_correcta).toBeUndefined();
    }

    const intentoNormaId = randomUUID();
    const resCrearNorma = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({
        id: intentoNormaId,
        unidad_id: unidadNormaMatch!.id,
      })
      .expect(201);

    const resFinNorma = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${intentoNormaId}/finalizar`)
      .set('Cookie', cookieAprendiz)
      .send({
        revision: resCrearNorma.body.revision,
        asociaciones: {
          'sit-1': 'op-proporcionalidad',
          'sit-2': 'op-informacion',
          'sit-3': 'op-finalidad',
        },
      })
      .expect(200);

    expect(resFinNorma.body.estado).toBe('finalizado');
    expect(resFinNorma.body.puntuacion).toBe(100);
    expect(resFinNorma.body.credito_otorgado).toBe(true);
    expect(resFinNorma.body.puntos_acreditados).toBe(20);

    // 3. Abrir, avanzar por etapas y finalizar CasoTech
    const resDetalleCaso = await request(app.getHttpServer())
      .get(`/api/v1/catalogo/unidades/${unidadCasoTech!.id}`)
      .set('Cookie', cookieAprendiz)
      .expect(200);

    const etapasCaso = resDetalleCaso.body.contenido.etapas as Array<{
      id: string;
      alternativas?: Array<{ id: string; ponderacion?: number }>;
    }>;
    for (const etapa of etapasCaso) {
      for (const alt of etapa.alternativas ?? []) {
        expect(alt.ponderacion).toBeUndefined();
      }
    }

    const intentoCasoId = randomUUID();
    const resCrearCaso = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', cookieAprendiz)
      .send({
        id: intentoCasoId,
        unidad_id: unidadCasoTech!.id,
      })
      .expect(201);

    const resPaso1 = await request(app.getHttpServer())
      .patch(`/api/v1/intentos/${intentoCasoId}/paso`)
      .set('Cookie', cookieAprendiz)
      .send({
        revision: resCrearCaso.body.revision,
        etapa_id: 'etapa-1',
        alternativa_id: 'alt-1a',
      })
      .expect(200);

    const resFinCaso = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${intentoCasoId}/finalizar`)
      .set('Cookie', cookieAprendiz)
      .send({
        revision: resPaso1.body.revision,
        etapa_id: 'etapa-2',
        alternativa_id: 'alt-2a',
      })
      .expect(200);

    expect(resFinCaso.body.estado).toBe('finalizado');
    expect(resFinCaso.body.puntuacion).toBe(100);
    expect(resFinCaso.body.credito_otorgado).toBe(true);
    expect(resFinCaso.body.puntos_acreditados).toBe(20);
  });

  it('seed:limpiar-contenido borra solo las unidades de ejemplo sin historial y conserva intentos, créditos y auditoría', async () => {
    const antes = (await appDataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM intento) AS intentos,
        (SELECT COUNT(*)::int FROM credito_unidad) AS creditos,
        (SELECT COUNT(*)::int FROM auditoria) AS auditorias
    `)) as Array<{ intentos: number; creditos: number; auditorias: number }>;

    expect(antes[0].intentos).toBe(3);
    expect(antes[0].creditos).toBe(3);

    const resumenLimpieza = await limpiarContenidoSeed(appDataSource, {
      NODE_ENV: 'test',
    });

    // De las 8 unidades sembradas, 3 tienen intentos/créditos del aprendiz y se conservan; las 5 sin historial se eliminan
    expect(resumenLimpieza.unidadesEliminadas).toBe(5);
    expect(resumenLimpieza.unidadesConservadasConHistorial).toBe(3);

    const despues = (await appDataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM intento) AS intentos,
        (SELECT COUNT(*)::int FROM credito_unidad) AS creditos,
        (SELECT COUNT(*)::int FROM auditoria) AS auditorias
    `)) as Array<{ intentos: number; creditos: number; auditorias: number }>;

    expect(despues[0].intentos).toBe(antes[0].intentos);
    expect(despues[0].creditos).toBe(antes[0].creditos);
    expect(despues[0].auditorias).toBe(antes[0].auditorias);
  });
});
