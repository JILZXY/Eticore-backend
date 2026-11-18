import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../app.controller.js';
import { AppService } from '../app.service.js';
import { configureApp } from '../app.setup.js';
import { AuthRateLimitGuard } from '../common/guards/auth-rate-limit.guard.js';
import { OwnershipGuard } from '../common/guards/ownership.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { AdminAccountsController } from '../modules/admin/admin-accounts.controller.js';
import { AdminAccountsService } from '../modules/admin/admin-accounts.service.js';
import { AdminAuditController } from '../modules/admin/admin-audit.controller.js';
import { AdminAuditService } from '../modules/admin/admin-audit.service.js';
import { AdminRolesController } from '../modules/admin/admin-roles.controller.js';
import { AdminRolesService } from '../modules/admin/admin-roles.service.js';
import { AttemptsFinalizationService } from '../modules/attempts/attempts-finalization.service.js';
import { AttemptsStepService } from '../modules/attempts/attempts-step.service.js';
import { AttemptsController } from '../modules/attempts/attempts.controller.js';
import { AttemptsService } from '../modules/attempts/attempts.service.js';
import { AuthController } from '../modules/auth/auth.controller.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { TotpChallengeService } from '../modules/auth/totp-challenge.service.js';
import { TotpSetupService } from '../modules/auth/totp-setup.service.js';
import { CatalogMuestraController } from '../modules/catalog/catalog-muestra.controller.js';
import { CatalogController } from '../modules/catalog/catalog.controller.js';
import { CatalogService } from '../modules/catalog/catalog.service.js';
import { EditorialDraftService } from '../modules/catalog/editorial-draft.service.js';
import { EditorialPublishService } from '../modules/catalog/editorial-publish.service.js';
import { EditorialController } from '../modules/catalog/editorial.controller.js';
import { GamificationController } from '../modules/gamification/gamification.controller.js';
import { GamificationService } from '../modules/gamification/gamification.service.js';
import { GroupsController } from '../modules/groups/groups.controller.js';
import { GroupsService } from '../modules/groups/groups.service.js';
import { LegalController } from '../modules/legal/legal.controller.js';
import { LegalService } from '../modules/legal/legal.service.js';
import { ReportsController } from '../modules/reports/reports.controller.js';
import { ReportsService } from '../modules/reports/reports.service.js';
import { RoutesProgressService } from '../modules/routes/routes-progress.service.js';
import { RoutesController } from '../modules/routes/routes.controller.js';
import { RoutesService } from '../modules/routes/routes.service.js';
import { UsersController } from '../modules/users/users.controller.js';
import { UsersService } from '../modules/users/users.service.js';
import type { AppConfiguration } from './configuration.js';
import { buildOpenApiDocument } from './openapi.config.js';

describe('OpenAPI / Swagger specification', () => {
  it('genera documento OpenAPI 3.0 completo con todos los módulos, esquemas DTO y cookie auth', async () => {
    const configMock = {
      get: vi.fn((clave: keyof AppConfiguration) => {
        if (clave === 'security') {
          return {
            totpEncryptionKeyHex: '0'.repeat(64),
            sessionCookieName: 'eticore_sid',
            sessionCookieSecure: true,
            sessionIdleTimeoutMinutes: 30,
            sessionAbsoluteTimeoutHours: 8,
            authRateLimitTtlSeconds: 60,
            authRateLimitMaxAttempts: 20,
            corsOrigin: 'http://localhost:5173',
          };
        }
        return undefined;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        AppController,
        AuthController,
        UsersController,
        CatalogController,
        CatalogMuestraController,
        EditorialController,
        AttemptsController,
        GamificationController,
        RoutesController,
        GroupsController,
        ReportsController,
        AdminAccountsController,
        AdminRolesController,
        AdminAuditController,
        LegalController,
      ],
      providers: [
        Reflector,
        { provide: ConfigService, useValue: configMock },
        { provide: DataSource, useValue: {} },
        { provide: AppService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: TotpSetupService, useValue: {} },
        { provide: TotpChallengeService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: CatalogService, useValue: {} },
        { provide: EditorialDraftService, useValue: {} },
        { provide: EditorialPublishService, useValue: {} },
        { provide: AttemptsService, useValue: {} },
        { provide: AttemptsStepService, useValue: {} },
        { provide: AttemptsFinalizationService, useValue: {} },
        { provide: GamificationService, useValue: {} },
        { provide: RoutesService, useValue: {} },
        { provide: RoutesProgressService, useValue: {} },
        { provide: GroupsService, useValue: {} },
        { provide: ReportsService, useValue: {} },
        { provide: AdminAccountsService, useValue: {} },
        { provide: AdminRolesService, useValue: {} },
        { provide: AdminAuditService, useValue: {} },
        { provide: LegalService, useValue: {} },
        SessionAuthGuard,
        RolesGuard,
        OwnershipGuard,
        AuthRateLimitGuard,
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const doc = buildOpenApiDocument(app);

    expect(doc.openapi).toMatch(/^3\.0\./);
    expect(doc.info.title).toBe('Eticore Backend API');
    expect(doc.components?.securitySchemes).toHaveProperty('cookie-sesion');

    const paths = Object.keys(doc.paths);
    expect(paths).toContain('/health');
    expect(paths).toContain('/api/v1/auth/registro');
    expect(paths).toContain('/api/v1/auth/login');
    expect(paths).toContain('/api/v1/auth/logout');
    expect(paths).toContain('/api/v1/auth/2fa/iniciar');
    expect(paths).toContain('/api/v1/auth/2fa/confirmar');
    expect(paths).toContain('/api/v1/auth/2fa/verificar');
    expect(paths).toContain('/api/v1/auth/2fa');
    expect(paths).toContain('/api/v1/usuarios/me');
    expect(paths).toContain('/api/v1/catalogo');
    expect(paths).toContain('/api/v1/catalogo/unidades/{id}');
    expect(paths).toContain('/api/v1/catalogo/unidades/{id}/muestra');
    expect(paths).toContain('/api/v1/editorial/unidades');
    expect(paths).toContain('/api/v1/editorial/versiones');
    expect(paths).toContain('/api/v1/editorial/versiones/{id}');
    expect(paths).toContain('/api/v1/editorial/versiones/{id}/revisiones');
    expect(paths).toContain('/api/v1/editorial/versiones/{id}/publicar');
    expect(paths).toContain('/api/v1/editorial/unidades/{id}/desactivar');
    expect(paths).toContain('/api/v1/intentos');
    expect(paths).toContain('/api/v1/intentos/me/historial');
    expect(paths).toContain('/api/v1/intentos/{id}');
    expect(paths).toContain('/api/v1/intentos/{id}/paso');
    expect(paths).toContain('/api/v1/intentos/{id}/finalizar');
    expect(paths).toContain('/api/v1/intentos/{id}/resultado');
    expect(paths).toContain('/api/v1/gamificacion/me/puntos');
    expect(paths).toContain('/api/v1/gamificacion/me/insignias');
    expect(paths).toContain('/api/v1/gamificacion/me/rango');
    expect(paths).toContain('/api/v1/rutas');
    expect(paths).toContain('/api/v1/rutas/{id}/elegir');
    expect(paths).toContain('/api/v1/rutas/me/cambiar');
    expect(paths).toContain('/api/v1/rutas/me/progreso');
    expect(paths).toContain('/api/v1/grupos');
    expect(paths).toContain('/api/v1/grupos/{id}/desactivar');
    expect(paths).toContain('/api/v1/grupos/{id}/integrantes');
    expect(paths).toContain('/api/v1/grupos/{id}/integrantes/{usuarioId}/retirar');
    expect(paths).toContain('/api/v1/reportes/grupos/{id}');
    expect(paths).toContain('/api/v1/admin/cuentas');
    expect(paths).toContain('/api/v1/admin/cuentas/{id}/activar');
    expect(paths).toContain('/api/v1/admin/cuentas/{id}/desactivar');
    expect(paths).toContain('/api/v1/admin/roles/asignar');
    expect(paths).toContain('/api/v1/admin/roles/retirar');
    expect(paths).toContain('/api/v1/admin/auditoria');
    expect(paths).toContain('/api/v1/legal/aviso');
    expect(paths).toContain('/api/v1/legal/documentos/versiones');
    expect(paths).toContain('/api/v1/legal/eventos');
    expect(paths).toContain('/api/v1/legal/mis-eventos');
    expect(paths).toContain('/api/v1/legal/solicitudes');

    const rutaSalida = join(import.meta.dirname, '../../openapi.json');
    writeFileSync(rutaSalida, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

    await app.close();
  });
});
