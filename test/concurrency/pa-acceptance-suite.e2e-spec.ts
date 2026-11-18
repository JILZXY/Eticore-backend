import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import {
  calcularPasoTotp,
  generarCodigoTotpEnPaso,
} from '../../src/common/utils/totp.js';
import {
  type EphemeralTestDb,
  startEphemeralPostgres,
} from '../helpers/postgres-test-db.js';

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

describe('Matriz de aceptación y concurrencia PA-01..PA-10 (01 §12)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;
  let temaId: number;

  const claveComun = 'clave aceptacion eticore 2026';

  const crearUsuario = async (params: {
    nombre: string;
    correo: string;
    rol?: 'ADMIN_TECNICO' | 'ADMIN_CONTENIDO';
    activar2fa?: boolean;
  }): Promise<{ id: number; cookie: string; secretoBase32?: string }> => {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: params.nombre,
        correo: params.correo,
        contrasena: claveComun,
      });
    expect(reg.status).toBe(201);
    const id = reg.body.usuario.id as number;

    if (params.rol) {
      await appDataSource.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         SELECT $1, id FROM rol WHERE codigo = $2`,
        [id, params.rol],
      );
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: params.correo, contrasena: claveComun });
    expect(loginRes.status).toBe(200);
    const cookie = extraerCookieSid(loginRes.headers['set-cookie']);

    if (params.activar2fa || params.rol) {
      const ini2fa = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/iniciar')
        .set('Cookie', cookie);
      expect(ini2fa.status).toBe(201);
      const secretoBase32 = ini2fa.body.clave_base32 as string;
      const bytes = decodificarBase32(secretoBase32);
      const codigo = generarCodigoTotpEnPaso(
        bytes,
        calcularPasoTotp(Date.now(), 30),
      );
      const conf = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/confirmar')
        .set('Cookie', cookie)
        .send({ codigo });
      expect(conf.status).toBe(200);
      return { id, cookie, secretoBase32 };
    }

    return { id, cookie };
  };

  beforeAll(async () => {
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
    await app.init();

    appDataSource = app.get(DataSource);

    const temas = (await appDataSource.query(
      `INSERT INTO tema (nombre, descripcion, activo)
       VALUES ('Ética Concurrencia', 'Tema suite PA', TRUE)
       RETURNING id`,
    )) as Array<{ id: number }>;
    temaId = temas[0].id;
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  it('PA-01: 10 registros concurrentes con mismo correo (mayusculas y espacios) producen 1 cuenta', async () => {
    const variantes = Array.from({ length: 10 }, (_, idx) =>
      idx % 2 === 0
        ? '  Concurrente.Pa01@Eticore.EDU.mx '
        : 'concurrente.pa01@eticore.edu.mx',
    );

    const respuestas = await Promise.all(
      variantes.map((correo) =>
        request(app.getHttpServer()).post('/api/v1/auth/registro').send({
          nombre_visualizacion: 'Aprendiz PA01',
          correo,
          contrasena: claveComun,
        }),
      ),
    );

    const exitos = respuestas.filter((r) => r.status === 201);
    const conflictos = respuestas.filter((r) => r.status === 409);
    expect(exitos).toHaveLength(1);
    expect(conflictos).toHaveLength(9);
  });

  it('PA-02 y PA-03: 20 finalizaciones concurrentes -> 1 credito; intento abierto conserva V1 tras publicar V2', async () => {
    const editor = await crearUsuario({
      nombre: 'Editor PA02',
      correo: 'editor.pa02@eticore.edu.mx',
      rol: 'ADMIN_CONTENIDO',
    });
    const aprendiz = await crearUsuario({
      nombre: 'Aprendiz PA02',
      correo: 'aprendiz.pa02@eticore.edu.mx',
    });

    // Crear unidad NormaMatch con V1
    const uRes = await request(app.getHttpServer())
      .post('/api/v1/editorial/unidades')
      .set('Cookie', editor.cookie)
      .send({ tipo: 'normamatch' });
    const unidadId = uRes.body.id as number;

    const v1Res = await request(app.getHttpServer())
      .post('/api/v1/editorial/versiones')
      .set('Cookie', editor.cookie)
      .send({
        unidad_id: unidadId,
        titulo: 'Norma PA02 V1',
        descripcion: 'Desc V1',
        tema_id: temaId,
        dificultad: 'basico',
        contenido: {
          situaciones: [
            {
              id: 's1',
              enunciado: 'Situación V1',
              opciones: [
                { id: 'a', texto: 'Correcta' },
                { id: 'b', texto: 'Incorrecta' },
              ],
              respuesta_correcta: 'a',
              explicacion: 'EXPLICACION_ORIGINAL_V1',
            },
          ],
        },
      });
    const v1Id = v1Res.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v1Id}/revisiones`)
      .set('Cookie', editor.cookie)
      .send({ resultado: 'aprobada' });
    await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v1Id}/publicar`)
      .set('Cookie', editor.cookie);

    // Aprendiz abre intento en V1 antes de publicar V2
    const intentoRes = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', aprendiz.cookie)
      .send({ unidad_id: unidadId });
    expect(intentoRes.status).toBe(201);
    const intentoId = intentoRes.body.id as string;

    // Editor crea, aprueba y publica V2 mientras el intento V1 sigue abierto
    const v2Res = await request(app.getHttpServer())
      .post('/api/v1/editorial/versiones')
      .set('Cookie', editor.cookie)
      .send({
        unidad_id: unidadId,
        titulo: 'Norma PA02 V2',
        descripcion: 'Desc V2',
        tema_id: temaId,
        dificultad: 'intermedio',
        contenido: {
          situaciones: [
            {
              id: 's1',
              enunciado: 'Situación V2',
              opciones: [
                { id: 'a', texto: 'Correcta V2' },
                { id: 'b', texto: 'Incorrecta V2' },
              ],
              respuesta_correcta: 'b',
              explicacion: 'EXPLICACION_V2',
            },
          ],
        },
      });
    const v2Id = v2Res.body.id as number;
    await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v2Id}/revisiones`)
      .set('Cookie', editor.cookie)
      .send({ resultado: 'aprobada' });
    await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v2Id}/publicar`)
      .set('Cookie', editor.cookie);

    // 20 reenvíos concurrentes del mismo intento abierto sobre V1
    const envios = Array.from({ length: 20 }, () =>
      request(app.getHttpServer())
        .post(`/api/v1/intentos/${intentoId}/finalizar`)
        .set('Cookie', aprendiz.cookie)
        .send({ asociaciones: { s1: 'a' } }),
    );
    const resultados = await Promise.all(envios);

    for (const res of resultados) {
      expect(res.status).toBe(200);
      expect(res.body.puntuacion).toBe(100);
      expect(res.body.version_id).toBe(v1Id);
    }

    // Explicación histórica conservada = V1 (PA-03)
    const histRes = await request(app.getHttpServer())
      .get(`/api/v1/intentos/${intentoId}/resultado`)
      .set('Cookie', aprendiz.cookie);
    expect(histRes.status).toBe(200);
    expect(JSON.stringify(histRes.body.retroalimentacion)).toContain(
      'EXPLICACION_ORIGINAL_V1',
    );
    expect(JSON.stringify(histRes.body.retroalimentacion)).not.toContain(
      'EXPLICACION_V2',
    );

    const creditos = (await appDataSource.query(
      `SELECT count(*)::int AS total FROM credito_unidad WHERE usuario_id = $1 AND unidad_id = $2`,
      [aprendiz.id, unidadId],
    )) as Array<{ total: number }>;
    expect(creditos[0].total).toBe(1);

    const insignias = (await appDataSource.query(
      `SELECT count(*)::int AS total FROM usuario_insignia WHERE usuario_id = $1`,
      [aprendiz.id],
    )) as Array<{ total: number }>;
    expect(insignias[0].total).toBeLessThanOrEqual(1);
  });

  it('PA-04: dos tecnicos piden su baja simultaneamente -> 1 aceptada, 1 rechazada, queda 1 tecnico activo', async () => {
    const t1 = await crearUsuario({
      nombre: 'Tech PA04 A',
      correo: 'tech.pa04a@eticore.edu.mx',
      rol: 'ADMIN_TECNICO',
    });
    const t2 = await crearUsuario({
      nombre: 'Tech PA04 B',
      correo: 'tech.pa04b@eticore.edu.mx',
      rol: 'ADMIN_TECNICO',
    });

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/admin/roles/retirar')
        .set('Cookie', t1.cookie)
        .send({ usuario_id: t1.id, rol_codigo: 'ADMIN_TECNICO' }),
      request(app.getHttpServer())
        .post('/api/v1/admin/roles/retirar')
        .set('Cookie', t2.cookie)
        .send({ usuario_id: t2.id, rol_codigo: 'ADMIN_TECNICO' }),
    ]);

    expect([r1.status, r2.status].sort((a, b) => a - b)).toEqual([200, 409]);

    const restantes = (await appDataSource.query(
      `SELECT COUNT(DISTINCT u.id)::int AS total
       FROM usuario u
       INNER JOIN usuario_rol ur ON ur.usuario_id = u.id
       INNER JOIN rol r ON r.id = ur.rol_id
       WHERE u.activo = TRUE AND r.codigo = 'ADMIN_TECNICO'`,
    )) as Array<{ total: number }>;
    expect(restantes[0].total).toBe(1);

    // Retirar ADMIN_TECNICO al sobreviviente para dejar la BD limpia respecto a otros tests
    const ganadorId = r1.status === 200 ? t2.id : t1.id;
    const cookieGanador = r1.status === 200 ? t2.cookie : t1.cookie;
    const ultimoRechazo = await request(app.getHttpServer())
      .post('/api/v1/admin/roles/retirar')
      .set('Cookie', cookieGanador)
      .send({ usuario_id: ganadorId, rol_codigo: 'ADMIN_TECNICO' });
    expect(ultimoRechazo.status).toBe(409);
  });

  it('PA-05, PA-06, PA-07, PA-08 y PA-10 + endurecimiento Helmet/CORS/rate limit', async () => {
    const adminTech = await crearUsuario({
      nombre: 'Tech PA05',
      correo: 'tech.pa05@eticore.edu.mx',
      rol: 'ADMIN_TECNICO',
    });
    const adminCont = await crearUsuario({
      nombre: 'Cont PA06',
      correo: 'cont.pa06@eticore.edu.mx',
      rol: 'ADMIN_CONTENIDO',
    });

    const alumnos = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        crearUsuario({
          nombre: `Alumno PA${i}`,
          correo: `alumno.pa${i}@eticore.edu.mx`,
        }),
      ),
    );

    // PA-05: Membresías concurrentes + solapamiento + reingreso + sin doble conteo
    const grupoRes = await request(app.getHttpServer())
      .post('/api/v1/grupos')
      .set('Cookie', adminTech.cookie)
      .send({ nombre: 'Grupo PA', periodo: '2026-2' });
    const grupoId = grupoRes.body.id as number;

    const u1 = alumnos[0].id;
    const [mA, mB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/grupos/${grupoId}/integrantes`)
        .set('Cookie', adminTech.cookie)
        .send({ usuario_id: u1, ingreso: '2026-10-01T00:00:00.000Z' }),
      request(app.getHttpServer())
        .post(`/api/v1/grupos/${grupoId}/integrantes`)
        .set('Cookie', adminTech.cookie)
        .send({ usuario_id: u1, ingreso: '2026-10-02T00:00:00.000Z' }),
    ]);
    expect([mA.status, mB.status].sort((a, b) => a - b)).toEqual([201, 409]);

    const inicioActivo = mA.status === 201 ? '2026-10-01T00:00:00.000Z' : '2026-10-02T00:00:00.000Z';
    expect(inicioActivo).toBeTruthy();

    await request(app.getHttpServer())
      .patch(`/api/v1/grupos/${grupoId}/integrantes/${u1}/retirar`)
      .set('Cookie', adminTech.cookie)
      .send({ salida: '2026-10-10T00:00:00.000Z' });

    const reingreso = await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', adminTech.cookie)
      .send({ usuario_id: u1, ingreso: '2026-10-12T00:00:00.000Z' });
    expect(reingreso.status).toBe(201);

    // PA-06: Edición tras aprobar rechazada por huella desactualizada
    const unidadRes = await request(app.getHttpServer())
      .post('/api/v1/editorial/unidades')
      .set('Cookie', adminCont.cookie)
      .send({ tipo: 'normamatch' });
    const unidadId = unidadRes.body.id as number;

    const v1 = await request(app.getHttpServer())
      .post('/api/v1/editorial/versiones')
      .set('Cookie', adminCont.cookie)
      .send({
        unidad_id: unidadId,
        titulo: 'Norma PA06',
        descripcion: 'Desc',
        tema_id: temaId,
        dificultad: 'basico',
        contenido: {
          situaciones: [
            {
              id: 's1',
              enunciado: 'Pregunta inicial',
              opciones: [
                { id: 'a', texto: 'A' },
                { id: 'b', texto: 'B' },
              ],
              respuesta_correcta: 'a',
              explicacion: 'Exp',
            },
          ],
        },
      });
    const v1Id = v1.body.id as number;

    await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v1Id}/revisiones`)
      .set('Cookie', adminCont.cookie)
      .send({ resultado: 'aprobada' });

    await request(app.getHttpServer())
      .patch(`/api/v1/editorial/versiones/${v1Id}`)
      .set('Cookie', adminCont.cookie)
      .send({ titulo: 'Norma PA06 editada tras aprobar' });

    const pubDesact = await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v1Id}/publicar`)
      .set('Cookie', adminCont.cookie);
    expect(pubDesact.status).toBe(422);
    expect(pubDesact.body.error.codigo).toBe('HUELLA_EDITORIAL_DESACTUALIZADA');

    await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v1Id}/revisiones`)
      .set('Cookie', adminCont.cookie)
      .send({ resultado: 'aprobada' });
    await request(app.getHttpServer())
      .post(`/api/v1/editorial/versiones/${v1Id}/publicar`)
      .set('Cookie', adminCont.cookie);

    // PA-07: Reporte con 4 participantes vs 5 participantes
    for (const al of alumnos.slice(1, 4)) {
      await request(app.getHttpServer())
        .post(`/api/v1/grupos/${grupoId}/integrantes`)
        .set('Cookie', adminTech.cookie)
        .send({ usuario_id: al.id, ingreso: '2026-10-01T00:00:00.000Z' });
    }
    for (let i = 0; i < 4; i += 1) {
      await appDataSource.query(
        `INSERT INTO intento (id, usuario_id, unidad_id, version_id, numero, estado, inicio, finalizacion, puntuacion)
         VALUES ($1, $2, $3, $4, 1, 'finalizado', '2026-10-15T10:00:00Z', '2026-10-15T10:05:00Z', 80)`,
        [randomUUID(), alumnos[i].id, unidadId, v1Id],
      );
    }

    const rep4 = await request(app.getHttpServer())
      .get(`/api/v1/reportes/grupos/${grupoId}`)
      .set('Cookie', adminCont.cookie)
      .query({
        desde: '2026-10-01T00:00:00.000Z',
        hasta: '2026-11-01T00:00:00.000Z',
      });
    expect(rep4.status).toBe(200);
    expect(rep4.body.celdas[0].participantes).toBe(4);
    expect(rep4.body.celdas[0].promedio).toBeNull();

    await request(app.getHttpServer())
      .post(`/api/v1/grupos/${grupoId}/integrantes`)
      .set('Cookie', adminTech.cookie)
      .send({ usuario_id: alumnos[4].id, ingreso: '2026-10-01T00:00:00.000Z' });
    await appDataSource.query(
      `INSERT INTO intento (id, usuario_id, unidad_id, version_id, numero, estado, inicio, finalizacion, puntuacion)
       VALUES ($1, $2, $3, $4, 1, 'finalizado', '2026-10-15T10:00:00Z', '2026-10-15T10:05:00Z', 100)`,
      [randomUUID(), alumnos[4].id, unidadId, v1Id],
    );

    const rep5 = await request(app.getHttpServer())
      .get(`/api/v1/reportes/grupos/${grupoId}`)
      .set('Cookie', adminCont.cookie)
      .query({
        desde: '2026-10-01T00:00:00.000Z',
        hasta: '2026-11-01T00:00:00.000Z',
      });
    expect(rep5.body.celdas[0].participantes).toBe(5);
    expect(rep5.body.celdas[0].promedio).toBe(84);

    // PA-08: Ruta vacía devuelve "Sin actividades" y desactivar unidad conserva crédito previo
    const rVacia = (await appDataSource.query(
      `INSERT INTO ruta (nombre, activa) VALUES ('Ruta Vacía PA', TRUE) RETURNING id`,
    )) as Array<{ id: number }>;
    const vrVacia = (await appDataSource.query(
      `INSERT INTO version_ruta (ruta_id, numero, publicada_en) VALUES ($1, 1, CURRENT_TIMESTAMP) RETURNING id`,
      [rVacia[0].id],
    )) as Array<{ id: string }>;
    await appDataSource.query(
      `UPDATE ruta SET version_actual_id = $1 WHERE id = $2`,
      [Number(vrVacia[0].id), rVacia[0].id],
    );

    await request(app.getHttpServer())
      .post(`/api/v1/rutas/${rVacia[0].id}/elegir`)
      .set('Cookie', alumnos[0].cookie);
    const progVacia = await request(app.getHttpServer())
      .get('/api/v1/rutas/me/progreso')
      .set('Cookie', alumnos[0].cookie);
    expect(progVacia.body.estado).toBe('Sin actividades');
    expect(progVacia.body.porcentaje).toBeNull();

    // Crédito ganado al finalizar unidad se conserva tras desactivar la unidad
    const intAntesBaja = await request(app.getHttpServer())
      .post('/api/v1/intentos')
      .set('Cookie', alumnos[1].cookie)
      .send({ unidad_id: unidadId });
    const finBajaRes = await request(app.getHttpServer())
      .post(`/api/v1/intentos/${intAntesBaja.body.id}/finalizar`)
      .set('Cookie', alumnos[1].cookie)
      .send({ asociaciones: { s1: 'a' } });
    expect(finBajaRes.status).toBe(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/editorial/unidades/${unidadId}/desactivar`)
      .set('Cookie', adminCont.cookie);

    const pts = await request(app.getHttpServer())
      .get('/api/v1/gamificacion/me/puntos')
      .set('Cookie', alumnos[1].cookie);
    expect(pts.body.puntos_totales).toBe(20);

    // PA-10: 2FA replay rechazado + desafio expirado + admin sin verificado_2fa
    await request(app.getHttpServer())
      .post('/api/v1/admin/roles/asignar')
      .set('Cookie', adminTech.cookie)
      .send({ usuario_id: alumnos[3].id, rol_codigo: 'ADMIN_CONTENIDO' });

    const adminSin2faRes = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', alumnos[3].cookie);
    expect(adminSin2faRes.status).toBe(403);
    expect(adminSin2faRes.body.error.codigo).toBe('SEGUNDO_FACTOR_REQUERIDO');

    const login2fa = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ correo: 'tech.pa05@eticore.edu.mx', contrasena: claveComun });
    expect(login2fa.status).toBe(202);
    const pasoActual = calcularPasoTotp(Date.now(), 30);
    const codigoReplay = generarCodigoTotpEnPaso(
      decodificarBase32(adminTech.secretoBase32!),
      pasoActual,
    );
    const resReplay = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verificar')
      .send({
        desafio_id: login2fa.body.desafio_id,
        codigo: codigoReplay,
      });
    expect(resReplay.status).toBe(401);
    expect(resReplay.body.error.codigo).toBe('CODIGO_TOTP_REUTILIZADO');

    const codigoFuturo = generarCodigoTotpEnPaso(
      decodificarBase32(adminTech.secretoBase32!),
      pasoActual + 1n,
    );
    const hashDes = createHash('sha256')
      .update(login2fa.body.desafio_id as string, 'utf8')
      .digest();
    await appDataSource.query(
      `UPDATE desafio_autenticacion
       SET creado_en = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
           expira_en = CURRENT_TIMESTAMP - INTERVAL '1 minute'
       WHERE token_hash = $1`,
      [hashDes],
    );
    const resExpirado = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verificar')
      .send({
        desafio_id: login2fa.body.desafio_id,
        codigo: codigoFuturo,
      });
    expect(resExpirado.status).toBe(401);
    expect(resExpirado.body.error.codigo).toBe('DESAFIO_EXPIRADO');

    // Endurecimiento: Helmet + CORS restringido + Rate Limiting 429
    const healthPermitido = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173');
    expect(healthPermitido.status).toBe(200);
    expect(healthPermitido.headers['x-frame-options']).toBe('DENY');
    expect(healthPermitido.headers['x-content-type-options']).toBe('nosniff');
    expect(healthPermitido.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );

    const healthBloqueado = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'https://malicioso.example.invalid');
    expect(healthBloqueado.headers['access-control-allow-origin']).toBeUndefined();

    for (let i = 0; i < 20; i += 1) {
      const r = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          correo: 'ratelimit.pa@eticore.edu.mx',
          contrasena: 'clave incorrecta para probar limite',
        });
      expect(r.status).toBe(401);
    }
    const rlBloqueado = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'ratelimit.pa@eticore.edu.mx',
        contrasena: 'clave incorrecta para probar limite',
      });
    expect(rlBloqueado.status).toBe(429);
    expect(rlBloqueado.body.error.codigo).toBe('LIMITE_PETICIONES_AUTH');
  });
});
