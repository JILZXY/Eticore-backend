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

describe('Auth 2FA TOTP (e2e con PostgreSQL 18.6)', () => {
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
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  it('aprendiz sin 2FA inicia sesion directo; al activar 2FA exige desafio 202, bloquea replay, rechaza expirado y borra fila al desactivar', async () => {
    const claveSintetica = 'clave 2fa aprendiz segura 2026';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Aprendiz 2FA',
        correo: 'aprendiz.2fa@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(reg.status).toBe(201);
    const usuarioId = reg.body.usuario.id as number;

    // 1) Login sin 2FA sigue devolviendo 200 + cookie
    const loginDirecto = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'aprendiz.2fa@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(loginDirecto.status).toBe(200);
    const cookieInicial = extraerCookieSid(loginDirecto.headers['set-cookie']);

    // 2) Iniciar alta 2FA (secreto cifrado AES-256-GCM en BD, confirmado_en = NULL)
    const inicio2fa = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/iniciar')
      .set('Cookie', cookieInicial);
    expect(inicio2fa.status).toBe(201);
    expect(inicio2fa.body.otpauth_uri).toContain('otpauth://totp/');
    const claveBase32 = inicio2fa.body.clave_base32 as string;
    const bytesPlano = decodificarBase32(claveBase32);

    const sfAntes = (await appDataSource.query(
      `SELECT secreto_cifrado, confirmado_en
       FROM segundo_factor
       WHERE usuario_id = $1`,
      [usuarioId],
    )) as Array<{ secreto_cifrado: Buffer; confirmado_en: Date | null }>;
    expect(sfAntes).toHaveLength(1);
    expect(sfAntes[0].confirmado_en).toBeNull();
    expect(sfAntes[0].secreto_cifrado.equals(bytesPlano)).toBe(false);

    // 3) Confirmar primer codigo TOTP (paso pasado para permitir verificar un paso actual justo despues)
    const pasoActual = calcularPasoTotp(Date.now(), 30);
    const pasoConfirmacion = pasoActual - 1n;
    const codigoConfirmacion = generarCodigoTotpEnPaso(
      bytesPlano,
      pasoConfirmacion,
    );

    const confirmacion = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/confirmar')
      .set('Cookie', cookieInicial)
      .send({ codigo: codigoConfirmacion });
    expect(confirmacion.status).toBe(200);
    expect(confirmacion.body.verificado_2fa).toBe(true);

    // 4) Siguiente login exige desafio 2FA (202 sin sesion ni cookie)
    const loginCon2fa = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'aprendiz.2fa@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(loginCon2fa.status).toBe(202);
    expect(loginCon2fa.body.requiere_2fa).toBe(true);
    expect(loginCon2fa.body.desafio_id).toBeTruthy();
    expect(loginCon2fa.headers['set-cookie']).toBeUndefined();

    const codigoActual = generarCodigoTotpEnPaso(bytesPlano, pasoActual);
    const verificacionOk = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verificar')
      .send({
        desafio_id: loginCon2fa.body.desafio_id,
        codigo_totp: codigoActual,
      });
    expect(verificacionOk.status).toBe(200);
    const cookieVerificada = extraerCookieSid(
      verificacionOk.headers['set-cookie'],
    );

    const sesionVerificada = (await appDataSource.query(
      `SELECT verificado_2fa
       FROM sesion
       WHERE usuario_id = $1 AND verificado_2fa = TRUE`,
      [usuarioId],
    )) as Array<{ verificado_2fa: boolean }>;
    expect(sesionVerificada.length).toBeGreaterThanOrEqual(1);

    // 5) Anti-replay: reutilizar el mismo codigo TOTP en otro desafio falla con 401
    const loginReplay = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'aprendiz.2fa@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(loginReplay.status).toBe(202);

    const replayRes = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verificar')
      .send({
        desafio_id: loginReplay.body.desafio_id,
        codigo_totp: codigoActual,
      });
    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error.codigo).toBe('CODIGO_TOTP_REUTILIZADO');

    // 6) Bloqueo temporal tras 5 intentos fallidos en el desafio -> 429 cuenta_bloqueada_2fa
    for (let i = 0; i < 4; i++) {
      const fallo = await request(app.getHttpServer())
        .post('/api/v1/auth/2fa/verificar')
        .send({
          desafio_id: loginReplay.body.desafio_id,
          codigo_totp: '000000',
        });
      // Si por casualidad el codigo generado fuera 000000, este loop seguiria validando
      if (fallo.status === 429) {
        expect(fallo.body.error.codigo).toBe('CUENTA_BLOQUEADA_2FA');
        break;
      }
      expect(fallo.status).toBe(401);
    }

    const auditoriaBloqueo = (await appDataSource.query(
      `SELECT accion
       FROM auditoria
       WHERE actor_id = $1 AND accion = 'cuenta_bloqueada_2fa'`,
      [usuarioId],
    )) as Array<{ accion: string }>;
    expect(auditoriaBloqueo.length).toBeGreaterThanOrEqual(1);

    // 7) Desafio expirado (> 5 min) -> 401 DESAFIO_EXPIRADO
    const loginExpirado = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'aprendiz.2fa@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(loginExpirado.status).toBe(202);

    await appDataSource.query(
      `UPDATE desafio_autenticacion
       SET creado_en = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
           expira_en = CURRENT_TIMESTAMP - INTERVAL '5 minutes'
       WHERE usuario_id = $1`,
      [usuarioId],
    );

    const resExpirado = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/verificar')
      .send({
        desafio_id: loginExpirado.body.desafio_id,
        codigo_totp: codigoActual,
      });
    expect(resExpirado.status).toBe(401);
    expect(resExpirado.body.error.codigo).toBe('DESAFIO_EXPIRADO');

    // 8) Desactivar 2FA borra fisicamente la fila y audita segundo_factor_desactivado
    const baja = await request(app.getHttpServer())
      .delete('/api/v1/auth/2fa')
      .set('Cookie', cookieVerificada)
      .send({ contrasena: claveSintetica });
    expect(baja.status).toBe(204);

    const sfDespues = (await appDataSource.query(
      `SELECT count(*)::int AS total
       FROM segundo_factor
       WHERE usuario_id = $1`,
      [usuarioId],
    )) as Array<{ total: number }>;
    expect(sfDespues[0].total).toBe(0);

    const auditoriaEventos = (await appDataSource.query(
      `SELECT accion
       FROM auditoria
       WHERE actor_id = $1`,
      [usuarioId],
    )) as Array<{ accion: string }>;
    const acciones = auditoriaEventos.map((a) => a.accion);
    expect(acciones).toContain('segundo_factor_activado');
    expect(acciones).toContain('autenticacion_segundo_factor_fallido');
    expect(acciones).toContain('cuenta_bloqueada_2fa');
    expect(acciones).toContain('segundo_factor_desactivado');
  });

  it('sesion de administrador sin verificado_2fa es rechazada con 403 y admin no puede desactivar 2FA', async () => {
    const claveSintetica = 'clave admin 2fa segura 2026';
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: 'Admin Tecnico',
        correo: 'admin.2fa@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(reg.status).toBe(201);
    const adminId = reg.body.usuario.id as number;

    await appDataSource.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id)
       SELECT $1, id FROM rol WHERE codigo = 'ADMIN_TECNICO'`,
      [adminId],
    );

    const loginAdminSin2fa = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo: 'admin.2fa@eticore.edu.mx',
        contrasena: claveSintetica,
      });
    expect(loginAdminSin2fa.status).toBe(200);
    const cookieAdmin = extraerCookieSid(loginAdminSin2fa.headers['set-cookie']);

    // Sesion admin sin verificado_2fa=true es rechazada con 403 en rutas protegidas
    const perfilBloqueado = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', cookieAdmin);
    expect(perfilBloqueado.status).toBe(403);
    expect(perfilBloqueado.body.error.codigo).toBe('SEGUNDO_FACTOR_REQUERIDO');

    // Pero si puede iniciar y confirmar su 2FA inicial
    const iniciar = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/iniciar')
      .set('Cookie', cookieAdmin);
    expect(iniciar.status).toBe(201);

    const bytesPlano = decodificarBase32(iniciar.body.clave_base32 as string);
    const paso = calcularPasoTotp(Date.now(), 30);
    const codigo = generarCodigoTotpEnPaso(bytesPlano, paso);

    const confirmar = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/confirmar')
      .set('Cookie', cookieAdmin)
      .send({ codigo });
    expect(confirmar.status).toBe(200);

    // Ahora la sesion ya tiene verificado_2fa=true y puede consultar /usuarios/me
    const perfilPermitido = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', cookieAdmin);
    expect(perfilPermitido.status).toBe(200);
    expect(perfilPermitido.body.roles).toContain('ADMIN_TECNICO');

    // Admin no puede desactivar su 2FA (C-01)
    const intentoDesactivar = await request(app.getHttpServer())
      .delete('/api/v1/auth/2fa')
      .set('Cookie', cookieAdmin)
      .send({ contrasena: claveSintetica });
    expect(intentoDesactivar.status).toBe(403);
    expect(intentoDesactivar.body.error.codigo).toBe(
      'SEGUNDO_FACTOR_OBLIGATORIO_ADMIN',
    );
  });
});
