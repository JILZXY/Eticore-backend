import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions.js';
import { ALL_ENTITIES } from '../database/entities/index.js';

export interface BuildPostgresOptionsParams {
  url: string;
  poolMax: number;
  ssl: boolean;
  applicationName?: string;
  includeEntities?: boolean;
}

export function buildPostgresDataSourceOptions(
  params: BuildPostgresOptionsParams,
): PostgresDataSourceOptions {
  return {
    type: 'postgres',
    url: params.url,
    synchronize: false,
    migrationsRun: false,
    logging: ['error'],
    entities: params.includeEntities === false ? [] : [...ALL_ENTITIES],
    ssl: params.ssl ? { rejectUnauthorized: true } : false,
    extra: {
      max: params.poolMax,
      application_name: params.applicationName ?? 'eticore-api',
    },
  };
}
