import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import type { AppConfiguration } from './configuration.js';

export const SWAGGER_COOKIE_AUTH = 'cookie-sesion';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const configService = app.get(ConfigService<AppConfiguration, true>);
  const security = configService.get('security', { infer: true });
  const cookieName = security?.sessionCookieName ?? 'eticore_sid';

  const builder = new DocumentBuilder()
    .setTitle('Eticore Backend API')
    .setDescription(
      'API REST de Eticore — Plataforma educativa de Ética y Legislación en Tecnologías de la Información. ' +
        'Autenticación mediante sesión opaca en servidor (cookie HttpOnly, sin JWT) y segundo factor TOTP (RFC 6238) obligatorio para administradores.',
    )
    .setVersion('1.0.0')
    .addCookieAuth(
      cookieName,
      {
        type: 'apiKey',
        in: 'cookie',
        name: cookieName,
        description:
          'Cookie de sesión opaca en servidor (HttpOnly, Secure, SameSite=Lax, Path=/api)',
      },
      SWAGGER_COOKIE_AUTH,
    )
    .addTag('Health', 'Verificación de salud del servicio y base de datos')
    .addTag(
      'Auth',
      'Registro, inicio/cierre de sesión opaca y segundo factor TOTP (2FA)',
    )
    .addTag('Usuarios', 'Autoservicio de perfil propio del usuario autenticado')
    .addTag(
      'Catálogo',
      'Consulta de unidades formativas publicadas, búsqueda y muestras públicas',
    )
    .addTag(
      'Editorial',
      'Flujo editorial (borradores, revisión con huella SHA-256, publicación atómica y baja)',
    )
    .addTag(
      'Intentos',
      'Ejecución de actividades (Aprende, NormaMatch, CasoTech), pasos con revisión optimista y finalización',
    )
    .addTag(
      'Gamificación',
      'Puntos, insignias y rango derivados de créditos por unidad',
    )
    .addTag(
      'Rutas',
      'Elección y cambio de ruta formativa con progreso derivado por versión inscrita',
    )
    .addTag(
      'Grupos',
      'Gestión de grupos e integrantes con intervalos temporales semiabiertos [ingreso, salida)',
    )
    .addTag(
      'Reportes',
      'Reporte agregado por grupo y versión con supresión de promedio para celdas < 5 participantes',
    )
    .addTag(
      'Admin',
      'Administración técnica de cuentas, asignación de roles con guarda de último técnico y lectura de auditoría',
    )
    .addTag(
      'Legal',
      'Documentos legales versionados, registro idempotente de eventos legales y solicitudes de privacidad',
    )
    .build();

  return SwaggerModule.createDocument(app, builder);
}

export function setupOpenApi(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'Eticore API — Documentación OpenAPI',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  return document;
}
