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

function extraerCookieSid(cabeceras: string[] | string | undefined): {
  cruda: string;
  par: string;
} {
  const lista = Array.isArray(cabeceras)
    ? cabeceras
    : cabeceras
      ? [cabeceras]
      : [];
  const encontrada = lista.find((c) => c.startsWith('eticore_sid='));
  if (!encontrada) {
    throw new Error('Cookie eticore_sid no presente en Set-Cookie');
  }
  return {
    cruda: encontrada,
    par: encontrada.split(';')[0] ?? '',
  };
}

describe('Auth y Users (e2e con PostgreSQL 18.6)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

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
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  it('registro duplicado (mayusculas, espacios y concurrencia) crea una sola cuenta con rol APRENDIZ', async () => {
    const claveSintetica = 'clave de prueba eticore 2026';

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/registro').send({
        nombre_visualizacion: 'Aprendiz Uno',
        correo: '  Aprendiz.Duplicado@Eticore.EDU.mx  ',
        contrasena: claveSintetica,
      }),
      request(app.getHttpServer()).post('/api/v1/auth/registro').send({
        nombre_visualizacion: 'Aprendiz Dos',
        correo: 'aprendiz.duplicado@eticore.edu.mx',
        contrasena: claveSintetica,
      }),
    ]);

    const estados = [resA.status, resB.status].sort((a, b) => a - b);
    expect(estados).toEqual([201, 409]);

    const ganadora = resA.status === 201 ? resA : resB;
    const perdedora = resA.status === 409 ? resA : resB;

    expect(ganadora.body.usuario.correo_normalizado).toBe(
      'aprendiz.duplicado@eticore.edu.mx',
    );
    expect(ganadora.body.usuario.roles).toEqual(['APRENDIZ']);
    expect(ganadora.body.usuario.verificador_argon2id).toBeUndefined();
    expect(perdedora.body.error.codigo).toBe('CORREO_YA_REGISTRADO');

    const conteo = (await appDataSource.query(
      `SELECT count(*)::int AS total
       FROM usuario
       WHERE correo_normalizado = 'aprendiz.duplicado@eticore.edu.mx'`,
    )) as Array<{ total: number }>;
    expect(conteo[0].total).toBe(1);
  });

  it('rechaza privilegios o campos extras en el registro (RN-02 / RN-12)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Intento Admin',
        correo: 'rol.extra@eticore.edu.mx',
        contrasena: 'frase de prueba valida 2026',
        rol: 'ADMIN_TECNICO',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('login correcto emite cookie HttpOnly/Secure/SameSite=Lax, login incorrecto devuelve 401 generico', async () => {
    const claveSintetica = 'frase segura de acceso 2026';

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Ana Prueba',
        correo: 'ana.login@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(reg.status).toBe(201);

    const falloContrasena = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'ana.login@eticore.edu.mx',
        contrasena: 'clave equivocada suficientemente larga',
      });
    expect(falloContrasena.status).toBe(401);
    expect(falloContrasena.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(falloContrasena.headers['set-cookie']).toBeUndefined();

    const falloInexistente = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'no.existe@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(falloInexistente.status).toBe(401);
    expect(falloInexistente.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(falloInexistente.body.error.mensaje).toBe(
      falloContrasena.body.error.mensaje,
    );

    const ok = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: '  ANA.LOGIN@eticore.edu.mx ',
        contrasena: claveSintetica,
      });
    expect(ok.status).toBe(200);
    expect(ok.body.usuario.correo_normalizado).toBe('ana.login@eticore.edu.mx');
    expect(ok.body.usuario.verificador_argon2id).toBeUndefined();

    const { cruda, par } = extraerCookieSid(ok.headers['set-cookie']);
    expect(cruda).toContain('HttpOnly');
    expect(cruda).toContain('Secure');
    expect(cruda).toContain('SameSite=Lax');
    expect(cruda).toContain('Path=/api');

    const sesiones = (await appDataSource.query(
      `SELECT octet_length(token_hash) AS bytes_hash, verificado_2fa
       FROM sesion
       WHERE usuario_id = $1`,
      [reg.body.usuario.id],
    )) as Array<{ bytes_hash: number; verificado_2fa: boolean }>;
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0].bytes_hash).toBe(32);
    expect(sesiones[0].verificado_2fa).toBe(false);

    // Perfil propio autenticado y rechazo de edicion de correo
    const perfil = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', par);
    expect(perfil.status).toBe(200);
    expect(perfil.body.nombre_visualizacion).toBe('Ana Prueba');
    expect(perfil.body.verificador_argon2id).toBeUndefined();

    const editCorreo = await request(app.getHttpServer())
      .patch('/api/v1/usuarios/me')
      .set('Cookie', par)
      .send({ correo: 'nuevo@eticore.edu.mx' });
    expect(editCorreo.status).toBe(400);

    const editNombre = await request(app.getHttpServer())
      .patch('/api/v1/usuarios/me')
      .set('Cookie', par)
      .send({ nombre_visualizacion: 'Ana Editada' });
    expect(editNombre.status).toBe(200);
    expect(editNombre.body.nombre_visualizacion).toBe('Ana Editada');
    expect(editNombre.body.correo_normalizado).toBe('ana.login@eticore.edu.mx');

    // Logout revoca inmediatamente
    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', par);
    expect(logout.status).toBe(204);

    const despuesLogout = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', par);
    expect(despuesLogout.status).toBe(401);
  });

  it('sesion expirada por inactividad (30 min) o limite absoluto (8 h) responde 401', async () => {
    const claveSintetica = 'frase larga sesion expirada 2026';

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Carlos Tiempo',
        correo: 'carlos.tiempo@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(reg.status).toBe(201);
    const usuarioId = reg.body.usuario.id as number;

    // 1) Expiracion por inactividad > 30 minutos
    const login1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'carlos.tiempo@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(login1.status).toBe(200);
    const cookie1 = extraerCookieSid(login1.headers['set-cookie']).par;

    await appDataSource.query(
      `UPDATE sesion
       SET creada_en = CURRENT_TIMESTAMP - INTERVAL '35 minutes',
           ultima_actividad = CURRENT_TIMESTAMP - INTERVAL '31 minutes'
       WHERE usuario_id = $1`,
      [usuarioId],
    );

    const resInactiva = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', cookie1);
    expect(resInactiva.status).toBe(401);
    expect(resInactiva.body.error.codigo).toBe('SESION_EXPIRADA');

    // 2) Expiracion por limite absoluto > 8 horas
    const login2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'carlos.tiempo@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(login2.status).toBe(200);
    const cookie2 = extraerCookieSid(login2.headers['set-cookie']).par;

    await appDataSource.query(
      `UPDATE sesion
       SET creada_en = CURRENT_TIMESTAMP - INTERVAL '9 hours',
           ultima_actividad = CURRENT_TIMESTAMP
       WHERE usuario_id = $1 AND revocada_en IS NULL AND ultima_actividad > CURRENT_TIMESTAMP - INTERVAL '5 minutes'`,
      [usuarioId],
    );

    const resAbsoluta = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', cookie2);
    expect(resAbsoluta.status).toBe(401);
    expect(resAbsoluta.body.error.codigo).toBe('SESION_EXPIRADA');
  });
});
