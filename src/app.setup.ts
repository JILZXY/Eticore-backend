import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import type { AppConfiguration } from './config/configuration.js';

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService<AppConfiguration, true>);
  const security = configService.get('security', { infer: true });

  const origenes = security.corsOrigin
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen.length > 0);

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: origenes.length === 1 ? origenes[0] : origenes,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
