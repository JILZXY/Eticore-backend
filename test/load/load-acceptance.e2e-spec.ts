import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { buildPostgresDataSourceOptions } from '../../src/config/database.config.js';
import {
  type EphemeralTestDb,
  startEphemeralPostgres,
} from '../helpers/postgres-test-db.js';

interface ResumenLatencia {
  operacion: string;
  muestras: number;
  errores: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

function resumirLatencias(
  operacion: string,
  valoresMs: number[],
  errores: number,
): ResumenLatencia {
  const ordenados = [...valoresMs].sort((a, b) => a - b);
  const total = ordenados.length;
  const suma = ordenados.reduce((acc, v) => acc + v, 0);
  const percentil = (p: number): number => {
    if (total === 0) {
      return 0;
    }
    const idx = Math.min(total - 1, Math.ceil((p / 100) * total) - 1);
    return Number((ordenados[idx] ?? 0).toFixed(2));
  };

  return {
    operacion,
    muestras: total,
    errores,
    minMs: total > 0 ? Number((ordenados[0] ?? 0).toFixed(2)) : 0,
    avgMs: total > 0 ? Number((suma / total).toFixed(2)) : 0,
    p50Ms: percentil(50),
    p95Ms: percentil(95),
    p99Ms: percentil(99),
    maxMs: total > 0 ? Number((ordenados[total - 1] ?? 0).toFixed(2)) : 0,
  };
}

function extraerCookie(res: Response): string {
  const cookies = res.headers.getSetCookie?.() ?? [];
  const encontrada = cookies.find((c) => c.includes('='));
  if (!encontrada) {
    const raw = res.headers.get('set-cookie') ?? '';
    return raw.split(';')[0] ?? '';
  }
  return encontrada.split(';')[0] ?? '';
}

describe('Prueba de carga local (50 concurrentes, umbral <= 5 s REQ-NF-01)', () => {
  let testDb: EphemeralTestDb | null = null;
  let externalDataSource: DataSource | null = null;
  let app: INestApplication | null = null;
  let baseUrl: string;
  let dbQueryRunner: DataSource;

  let unidadAprendeId: number;
  let unidadNormaId: number;

  const cookiesTrabajadores: string[] = [];
  const totalConcurrentes = 50;

  beforeAll(async () => {
    const externalBaseUrl = process.env.LOAD_TEST_BASE_URL?.trim();
    const externalDbUrl = process.env.LOAD_TEST_DATABASE_URL?.trim();

    if (externalBaseUrl && externalDbUrl) {
      baseUrl = externalBaseUrl.replace(/\/$/, '');
      externalDataSource = new DataSource(
        buildPostgresDataSourceOptions({
          url: externalDbUrl,
          poolMax: 5,
          ssl: false,
          applicationName: 'eticore-load-setup',
          includeEntities: false,
        }),
      );
      await externalDataSource.initialize();
      dbQueryRunner = externalDataSource;
    } else {
      testDb = await startEphemeralPostgres();

      process.env.NODE_ENV = 'test';
      process.env.PORT = '3000';
      process.env.DATABASE_URL = testDb.url;
      process.env.AUTH_DATABASE_URL = testDb.url;
      process.env.AUDIT_DATABASE_URL = testDb.url;
      process.env.MIGRATION_DATABASE_URL = testDb.url;
      process.env.DB_POOL_MAX = '15';
      process.env.DB_SSL = 'false';
      process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
      process.env.SESSION_COOKIE_NAME = 'eticore_sid';
      process.env.SESSION_COOKIE_SECURE = 'true';
      process.env.SESSION_IDLE_TIMEOUT_MINUTES = '30';
      process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS = '8';
      process.env.AUTH_RATE_LIMIT_TTL_SECONDS = '60';
      process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '20';
      process.env.CORS_ORIGIN = 'http://localhost:5173';

      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.listen(0, '127.0.0.1');

      const addr = app.getHttpServer().address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      dbQueryRunner = app.get(DataSource);
    }

    const sufijo = randomBytes(4).toString('hex');
    const temas = (await dbQueryRunner.query(
      `INSERT INTO tema (nombre, descripcion, activo)
       VALUES ($1, 'Tema para prueba de carga', TRUE)
       RETURNING id`,
      [`Ética Carga ${sufijo}`],
    )) as Array<{ id: number }>;
    const temaId = temas[0].id;

    // Sembrar unidad Aprende publicada
    const uApr = (await dbQueryRunner.query(
      `INSERT INTO unidad (tipo, activa, muestra_publica)
       VALUES ('aprende', TRUE, TRUE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    unidadAprendeId = uApr[0].id;

    const contenidoApr = {
      objetivo: 'Comprender ética de datos y privacidad en sistemas TI',
      secciones: [
        {
          id: 's1',
          orden: 1,
          titulo: 'Principios de minimización',
          cuerpo: 'Ética aplicada al diseño de software.',
        },
      ],
      ejemplo: 'Ejemplo sintético de privacidad por diseño.',
    };
    const vApr = (await dbQueryRunner.query(
      `INSERT INTO version_unidad
         (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
       VALUES ($1, 1, 'Ética de Datos Carga', 'Lección sobre ética y minimización', $2, 'basico', 'publicado', 1, $3::jsonb, CURRENT_TIMESTAMP)
       RETURNING id`,
      [unidadAprendeId, temaId, JSON.stringify(contenidoApr)],
    )) as Array<{ id: string }>;
    await dbQueryRunner.query(
      `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
      [Number(vApr[0].id), unidadAprendeId],
    );

    // Sembrar unidad NormaMatch publicada
    const uNorma = (await dbQueryRunner.query(
      `INSERT INTO unidad (tipo, activa, muestra_publica)
       VALUES ('normamatch', TRUE, FALSE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    unidadNormaId = uNorma[0].id;

    const contenidoNorma = {
      situaciones: [
        {
          id: 'sit1',
          enunciado: 'Evaluar uso mínimo de datos en bitácoras',
          opciones: [
            { id: 'op1', texto: 'Registrar solo eventos mínimos sin secretos' },
            { id: 'op2', texto: 'Guardar credenciales completas' },
          ],
          respuesta_correcta: 'op1',
          explicacion: 'RN-17 prohíbe registrar secretos o cuerpos sensibles.',
        },
      ],
    };
    const vNorma = (await dbQueryRunner.query(
      `INSERT INTO version_unidad
         (unidad_id, numero, titulo, descripcion, tema_id, dificultad, estado, esquema_version, contenido, publicada_en)
       VALUES ($1, 1, 'NormaMatch Carga', 'Ejercicio de ética normativa', $2, 'intermedio', 'publicado', 1, $3::jsonb, CURRENT_TIMESTAMP)
       RETURNING id`,
      [unidadNormaId, temaId, JSON.stringify(contenidoNorma)],
    )) as Array<{ id: string }>;
    await dbQueryRunner.query(
      `UPDATE unidad SET version_publicada_id = $1 WHERE id = $2`,
      [Number(vNorma[0].id), unidadNormaId],
    );

    // Crear 50 cuentas sintéticas con credenciales generadas dinámicamente en memoria
    const lote = 10;
    for (let inicio = 0; inicio < totalConcurrentes; inicio += lote) {
      const promesas: Array<Promise<string>> = [];
      for (
        let i = inicio;
        i < Math.min(inicio + lote, totalConcurrentes);
        i += 1
      ) {
        promesas.push(
          (async () => {
            const correo = `carga.${sufijo}.${i}@eticore.edu.mx`;
            const claveTemporal = `CargaSintetica_${randomBytes(12).toString('hex')}`;

            const reg = await fetch(`${baseUrl}/api/v1/auth/registro`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                nombre_visualizacion: `Carga ${i}`,
                correo,
                contrasena: claveTemporal,
              }),
            });
            expect(reg.status).toBe(201);

            const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ correo, contrasena: claveTemporal }),
            });
            expect(login.status).toBe(200);
            return extraerCookie(login);
          })(),
        );
      }
      const cookiesLote = await Promise.all(promesas);
      cookiesTrabajadores.push(...cookiesLote);
    }
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (externalDataSource?.isInitialized) {
      await externalDataSource.destroy();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  it('ejecuta 50 flujos concurrentes (catalogo, busqueda, apertura y envio) por debajo de 5 s', async () => {
    const latenciasCatalogo: number[] = [];
    const latenciasBusqueda: number[] = [];
    const latenciasApertura: number[] = [];
    const latenciasEnvio: number[] = [];

    let errCatalogo = 0;
    let errBusqueda = 0;
    let errApertura = 0;
    let errEnvio = 0;

    const medirFetch = async (
      url: string,
      init: RequestInit,
      cubo: number[],
      onError: () => void,
    ): Promise<globalThis.Response> => {
      const t0 = performance.now();
      const res = await fetch(url, init);
      const ms = performance.now() - t0;
      cubo.push(ms);
      if (!res.ok) {
        onError();
      }
      return res;
    };

    const inicioGlobal = performance.now();

    await Promise.all(
      cookiesTrabajadores.map(async (cookie) => {
        const headersBase = {
          cookie,
          'content-type': 'application/json',
        };

        // 1) Catálogo (3 consultas por trabajador = 150 peticiones)
        for (let r = 0; r < 3; r += 1) {
          const resCat = await medirFetch(
            `${baseUrl}/api/v1/catalogo?limit=20`,
            { method: 'GET', headers: { cookie } },
            latenciasCatalogo,
            () => {
              errCatalogo += 1;
            },
          );
          await resCat.arrayBuffer();
        }

        // 2) Búsqueda por palabras (50 peticiones)
        const resBusq = await medirFetch(
          `${baseUrl}/api/v1/catalogo?q=etica&dificultad=basico`,
          { method: 'GET', headers: { cookie } },
          latenciasBusqueda,
          () => {
            errBusqueda += 1;
          },
        );
        await resBusq.arrayBuffer();

        // 3) Apertura de lección Aprende y creación de intento NormaMatch (100 peticiones)
        const resDetalle = await medirFetch(
          `${baseUrl}/api/v1/catalogo/unidades/${unidadAprendeId}`,
          { method: 'GET', headers: { cookie } },
          latenciasApertura,
          () => {
            errApertura += 1;
          },
        );
        await resDetalle.arrayBuffer();

        const intentoId = randomUUID();
        const resAbrir = await medirFetch(
          `${baseUrl}/api/v1/intentos`,
          {
            method: 'POST',
            headers: headersBase,
            body: JSON.stringify({
              id: intentoId,
              unidad_id: unidadNormaId,
            }),
          },
          latenciasApertura,
          () => {
            errApertura += 1;
          },
        );
        const aperturaBody = (await resAbrir.json()) as { revision: number };

        // 4) Guardado de paso + finalización de actividad (100 peticiones)
        const resPaso = await medirFetch(
          `${baseUrl}/api/v1/intentos/${intentoId}/paso`,
          {
            method: 'PATCH',
            headers: headersBase,
            body: JSON.stringify({
              revision: aperturaBody.revision,
              asociaciones: { sit1: 'op1' },
            }),
          },
          latenciasEnvio,
          () => {
            errEnvio += 1;
          },
        );
        await resPaso.arrayBuffer();

        const resFin = await medirFetch(
          `${baseUrl}/api/v1/intentos/${intentoId}/finalizar`,
          {
            method: 'POST',
            headers: headersBase,
            body: JSON.stringify({ asociaciones: { sit1: 'op1' } }),
          },
          latenciasEnvio,
          () => {
            errEnvio += 1;
          },
        );
        await resFin.arrayBuffer();
      }),
    );

    const duracionTotalMs = Number((performance.now() - inicioGlobal).toFixed(2));
    const resumenes = [
      resumirLatencias('catalogo_listado', latenciasCatalogo, errCatalogo),
      resumirLatencias('catalogo_busqueda', latenciasBusqueda, errBusqueda),
      resumirLatencias('apertura_actividad', latenciasApertura, errApertura),
      resumirLatencias('envio_finalizacion', latenciasEnvio, errEnvio),
    ];

    console.info(
      `LOAD_TEST_METRICS: ${JSON.stringify({
        target: baseUrl,
        concurrentes: totalConcurrentes,
        duracionTotalMs,
        totalPeticiones:
          latenciasCatalogo.length +
          latenciasBusqueda.length +
          latenciasApertura.length +
          latenciasEnvio.length,
        resumenes,
      })}`,
    );

    for (const r of resumenes) {
      expect(r.errores).toBe(0);
      expect(r.maxMs).toBeLessThanOrEqual(5000);
    }
  }, 120_000);
});
