import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
import type { AppConfiguration } from './config/configuration.js';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService<AppConfiguration, true>);
  const security = configService.get('security', { infer: true });

  const origenesPermitidos = new Set(
    security.corsOrigin
      .split(',')
      .map((origen) => origen.trim())
      .filter((origen) => origen.length > 0),
  );

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.use(
    helmet({
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || origenesPermitidos.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
}
