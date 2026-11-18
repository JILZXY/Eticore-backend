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

function construirUrlAuditRol(baseUrl: string, rol: string, clave: string): string {
  const url = new URL(baseUrl);
  url.username = rol;
  url.password = clave;
  return url.toString();
}

describe('Admin & Legal (e2e concurrencia último técnico, sesiones e idempotencia)', () => {
  let testDb: EphemeralTestDb;
  let app: INestApplication<App>;
  let appDataSource: DataSource;

  let tecnico1Id: number;
  let cookieTecnico1: string;
  let tecnico2Id: number;
  let cookieTecnico2: string;

  let cookieAdminContenido: string;
  let aprendizId: number;
  let cookieAprendiz: string;

  const claveComun = 'clave admin legal e2e segura 2026';

  const activar2faParaUsuario = async (cookie: string): Promise<void> => {
    const ini = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/iniciar')
      .set('Cookie', cookie);
    expect(ini.status).toBe(201);

    const bytes = decodificarBase32(ini.body.clave_base32 as string);
    const codigo = generarCodigoTotpEnPaso(
      bytes,
      calcularPasoTotp(Date.now(), 30),
    );

    const conf = await request(app.getHttpServer())
      .post('/api/v1/auth/2fa/confirmar')
      .set('Cookie', cookie)
      .send({ codigo });
    expect(conf.status).toBe(200);
  };

  const registrarYLoguear = async (
    nombre: string,
    correo: string,
    rolCodigo?: 'ADMIN_TECNICO' | 'ADMIN_CONTENIDO',
  ): Promise<{ id: number; cookie: string }> => {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/registro')
      .send({
        nombre_visualizacion: nombre,
        correo,
        contrasena: claveComun,
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
      .send({ correo, contrasena: claveComun });
    expect(loginRes.status).toBe(200);
    const cookie = extraerCookieSid(loginRes.headers['set-cookie']);

    if (rolCodigo) {
      await activar2faParaUsuario(cookie);
    }

    return { id, cookie };
  };

  beforeAll(async () => {
    testDb = await startEphemeralPostgres();

    // Crear rol dedicado de solo lectura eticore_auditoria dentro de PostgreSQL de prueba
    const credencialRolAuditoria = randomBytes(16).toString('hex');
    await testDb.dataSource.query(
      `CREATE ROLE eticore_auditoria WITH LOGIN PASSWORD '${credencialRolAuditoria}'`,
    );
    await testDb.dataSource.query(
      `GRANT USAGE ON SCHEMA public TO eticore_auditoria`,
    );
    await testDb.dataSource.query(
      `GRANT SELECT ON TABLE auditoria, auditoria_bd TO eticore_auditoria`,
    );

    const auditDbUrl = construirUrlAuditRol(
      testDb.url,
      'eticore_auditoria',
      credencialRolAuditoria,
    );

    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = testDb.url;
    process.env.AUTH_DATABASE_URL = testDb.url;
    process.env.AUDIT_DATABASE_URL = auditDbUrl;
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

    const t1 = await registrarYLoguear(
      'Tecnico Uno',
      'tecnico1.adm@eticore.edu.mx',
      'ADMIN_TECNICO',
    );
    tecnico1Id = t1.id;
    cookieTecnico1 = t1.cookie;

    const t2 = await registrarYLoguear(
      'Tecnico Dos',
      'tecnico2.adm@eticore.edu.mx',
      'ADMIN_TECNICO',
    );
    tecnico2Id = t2.id;
    cookieTecnico2 = t2.cookie;

    const ac = await registrarYLoguear(
      'Editor Admin',
      'editor.adm@eticore.edu.mx',
      'ADMIN_CONTENIDO',
    );
    cookieAdminContenido = ac.cookie;

    const apr = await registrarYLoguear(
      'Aprendiz Admin',
      'aprendiz.adm@eticore.edu.mx',
    );
    aprendizId = apr.id;
    cookieAprendiz = apr.cookie;
  }, 60_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (testDb) {
      await testDb.stop();
    }
  });

  it('dos tecnicos piden su baja simultaneamente -> acepta una y rechaza otra dejando 1 tecnico activo (RN-29)', async () => {
    // 1) Concurrencia en desactivación de cuenta de los dos únicos ADMIN_TECNICO activos
    const [bajaA, bajaB] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/api/v1/admin/cuentas/${tecnico2Id}/desactivar`)
        .set('Cookie', cookieTecnico1),
      request(app.getHttpServer())
        .patch(`/api/v1/admin/cuentas/${tecnico1Id}/desactivar`)
        .set('Cookie', cookieTecnico2),
    ]);

    const codigosBaja = [bajaA.status, bajaB.status].sort((a, b) => a - b);
    expect(codigosBaja).toEqual([200, 409]);

    const rechazada = bajaA.status === 409 ? bajaA : bajaB;
    expect(rechazada.body.error.codigo).toBe('ULTIMO_ADMIN_TECNICO_ACTIVO');

    const aceptada = bajaA.status === 200 ? bajaA : bajaB;
    const desactivadoId = aceptada.body.id as number;
    const sobrevivienteId =
      desactivadoId === tecnico1Id ? tecnico2Id : tecnico1Id;
    const cookieSobreviviente =
      desactivadoId === tecnico1Id ? cookieTecnico2 : cookieTecnico1;
    const cookieDesactivado =
      desactivadoId === tecnico1Id ? cookieTecnico1 : cookieTecnico2;

    // Verificar exactamente 1 técnico activo
    const activosTrasDesactivar = (await appDataSource.query(
      `SELECT COUNT(DISTINCT u.id)::int AS total
       FROM usuario u
       INNER JOIN usuario_rol ur ON ur.usuario_id = u.id
       INNER JOIN rol r ON r.id = ur.rol_id
       WHERE u.activo = TRUE
         AND r.codigo = 'ADMIN_TECNICO'`,
    )) as Array<{ total: number }>;
    expect(activosTrasDesactivar[0].total).toBe(1);

    // La sesión del técnico desactivado fue revocada en la misma transacción -> 401
    const sesionRevocadaRes = await request(app.getHttpServer())
      .get('/api/v1/usuarios/me')
      .set('Cookie', cookieDesactivado);
    expect(sesionRevocadaRes.status).toBe(401);

    // Reactivar al técnico que quedó inactivo y probar retiro de rol concurrente
    const reactivarRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/cuentas/${desactivadoId}/activar`)
      .set('Cookie', cookieSobreviviente);
    expect(reactivarRes.status).toBe(200);
    expect(reactivarRes.body.activo).toBe(true);

    // Reautenticar al técnico reactivado con TOTP (ya tiene 2FA confirmado)
    const loginRe = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        correo:
          desactivadoId === tecnico1Id
            ? 'tecnico1.adm@eticore.edu.mx'
            : 'tecnico2.adm@eticore.edu.mx',
        contrasena: claveComun,
      });
    expect(loginRe.status).toBe(202);
    // Para continuar pruebas de concurrencia con sesión válida sobre el sobreviviente + segundo técnico,
    // otorgar temporalmente ADMIN_TECNICO a otro usuario? No necesario: usamos rol existente o verificamos
    // retiro simultáneo del rol ADMIN_TECNICO ejecutado por cookieSobreviviente vs petición paralela!
    // En lugar de usar una sesión no verificada, asignamos ADMIN_TECNICO con rol vigente y probamos retiro simultáneo:
    const [retiroA, retiroB] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/admin/roles/retirar')
        .set('Cookie', cookieSobreviviente)
        .send({ usuario_id: desactivadoId, rol_codigo: 'ADMIN_TECNICO' }),
      request(app.getHttpServer())
        .post('/api/v1/admin/roles/retirar')
        .set('Cookie', cookieSobreviviente)
        .send({ usuario_id: sobrevivienteId, rol_codigo: 'ADMIN_TECNICO' }),
    ]);

    const codigosRetiro = [retiroA.status, retiroB.status].sort((a, b) => a - b);
    expect(codigosRetiro).toEqual([200, 409]);

    const restantesFinal = (await appDataSource.query(
      `SELECT u.id
       FROM usuario u
       INNER JOIN usuario_rol ur ON ur.usuario_id = u.id
       INNER JOIN rol r ON r.id = ur.rol_id
       WHERE u.activo = TRUE
         AND r.codigo = 'ADMIN_TECNICO'`,
    )) as Array<{ id: number }>;
    expect(restantesFinal).toHaveLength(1);

    // Restaurar sesión activa del técnico sobreviviente asegurando que queda 1 ADMIN_TECNICO válido
    const idTechActual = restantesFinal[0].id;
    expect(idTechActual).toBeGreaterThan(0);

    // Reasignar ADMIN_TECNICO a tecnico1Id para dejar un cookie administrativo limpio si hiciera falta
    if (idTechActual !== sobrevivienteId) {
      await appDataSource.query(
        `INSERT INTO usuario_rol (usuario_id, rol_id)
         SELECT $1, id FROM rol WHERE codigo = 'ADMIN_TECNICO'
         ON CONFLICT (usuario_id, rol_id) DO NOTHING`,
        [sobrevivienteId],
      );
    }

    // Asignar ADMIN_CONTENIDO al aprendiz y luego retirarlo verificando auditoría
    const asignarRes = await request(app.getHttpServer())
      .post('/api/v1/admin/roles/asignar')
      .set('Cookie', cookieSobreviviente)
      .send({ usuario_id: aprendizId, rol_codigo: 'ADMIN_CONTENIDO' });
    expect(asignarRes.status).toBe(200);
    expect(asignarRes.body.roles).toContain('ADMIN_CONTENIDO');

    const retirarAprRes = await request(app.getHttpServer())
      .post('/api/v1/admin/roles/retirar')
      .set('Cookie', cookieSobreviviente)
      .send({ usuario_id: aprendizId, rol_codigo: 'ADMIN_CONTENIDO' });
    expect(retirarAprRes.status).toBe(200);
    expect(retirarAprRes.body.roles).toEqual(['APRENDIZ']);

    // RN-14: ADMIN_CONTENIDO no puede leer cuentas ni auditoría técnica
    const cuentasContenido = await request(app.getHttpServer())
      .get('/api/v1/admin/cuentas')
      .set('Cookie', cookieAdminContenido);
    expect(cuentasContenido.status).toBe(403);

    const audContenido = await request(app.getHttpServer())
      .get('/api/v1/admin/auditoria')
      .set('Cookie', cookieAdminContenido);
    expect(audContenido.status).toBe(403);

    // Cuentas paginadas y mínimas sin credenciales ni hashes
    const cuentasRes = await request(app.getHttpServer())
      .get('/api/v1/admin/cuentas')
      .set('Cookie', cookieSobreviviente)
      .query({ limit: 2 });
    expect(cuentasRes.status).toBe(200);
    expect(cuentasRes.body.items).toHaveLength(2);
    expect(cuentasRes.body.siguiente_cursor).toBeTruthy();
    expect(cuentasRes.body.items[0]).not.toHaveProperty('verificador_argon2id');
    expect(cuentasRes.body.items[0]).not.toHaveProperty('secreto_cifrado');

    // Lectura de auditoría app + bd a través del rol PostgreSQL eticore_auditoria
    const audApp = await request(app.getHttpServer())
      .get('/api/v1/admin/auditoria')
      .set('Cookie', cookieSobreviviente)
      .query({ fuente: 'aplicacion', accion: 'desactivar_cuenta' });
    expect(audApp.status).toBe(200);
    expect(audApp.body.items.length).toBeGreaterThanOrEqual(1);

    const audBd = await request(app.getHttpServer())
      .get('/api/v1/admin/auditoria')
      .set('Cookie', cookieSobreviviente)
      .query({ fuente: 'bd', recurso_tipo: 'credencial' });
    expect(audBd.status).toBe(200);
    expect(audBd.body.items.length).toBeGreaterThanOrEqual(1);
    // El trigger eliminó verificador_argon2id de datos_nuevos (C-04)
    expect(audBd.body.items[0].datos_nuevos).not.toHaveProperty(
      'verificador_argon2id',
    );
  });

  it('legal: aviso publico, evento idempotente ante reenvios concurrentes, retiro de consentimiento y solicitud minima', async () => {
    // 1) Aviso público sin sesión
    const avisoRes = await request(app.getHttpServer()).get(
      '/api/v1/legal/aviso',
    );
    expect(avisoRes.status).toBe(200);
    expect(avisoRes.body.tipo).toBe('aviso_privacidad');
    expect(avisoRes.body.huella).toMatch(/^[0-9a-f]{64}$/);
    const versionDocId = avisoRes.body.version_documento_id as number;

    // 2) Reenvíos concurrentes con la misma clave_operacion producen exactamente 1 fila
    const claveOp = randomUUID();
    const envios = Array.from({ length: 10 }, () =>
      request(app.getHttpServer())
        .post('/api/v1/legal/eventos')
        .set('Cookie', cookieAprendiz)
        .send({
          version_documento_id: versionDocId,
          tipo_evento: 'consentimiento_otorgado',
          finalidad_codigo: 'metricas_academicas',
          canal: 'web',
          clave_operacion: claveOp,
        }),
    );

    const respuestas = await Promise.all(envios);
    for (const r of respuestas) {
      expect(r.status).toBe(201);
      expect(r.body.clave_operacion).toBe(claveOp);
    }
    const idsUnicos = new Set(respuestas.map((r) => r.body.id as number));
    expect(idsUnicos.size).toBe(1);

    // 3) Retiro de consentimiento como evento nuevo sin sobrescribir el anterior (A57)
    const retiroCons = await request(app.getHttpServer())
      .post('/api/v1/legal/eventos')
      .set('Cookie', cookieAprendiz)
      .send({
        version_documento_id: versionDocId,
        tipo_evento: 'consentimiento_retirado',
        finalidad_codigo: 'metricas_academicas',
        clave_operacion: randomUUID(),
      });
    expect(retiroCons.status).toBe(201);

    const misEventos = await request(app.getHttpServer())
      .get('/api/v1/legal/mis-eventos')
      .set('Cookie', cookieAprendiz);
    expect(misEventos.status).toBe(200);
    expect(misEventos.body.eventos).toHaveLength(2);
    expect(
      misEventos.body.estado_consentimientos.metricas_academicas.tipo_evento,
    ).toBe('consentimiento_retirado');

    // 4) Solicitud de privacidad mínima y rechazo de adjunto con identificación
    const adjuntoRechazado = await request(app.getHttpServer())
      .post('/api/v1/legal/solicitudes')
      .set('Cookie', cookieAprendiz)
      .send({
        tipo: 'supresion',
        verificacion_minima: 'data:image/png;base64,AAAA',
      });
    expect(adjuntoRechazado.status).toBe(400);
    expect(adjuntoRechazado.body.error.codigo).toBe(
      'ADJUNTO_IDENTIFICACION_PROHIBIDO',
    );

    const solicitudValida = await request(app.getHttpServer())
      .post('/api/v1/legal/solicitudes')
      .set('Cookie', cookieAprendiz)
      .send({
        tipo: 'acceso',
        verificacion_minima: 'Confirmación mediante sesión autenticada',
      });
    expect(solicitudValida.status).toBe(201);
    expect(solicitudValida.body.estado).toBe('recibida');
  });
});
