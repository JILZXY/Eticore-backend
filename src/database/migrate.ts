import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration.js';
import { buildPostgresDataSourceOptions } from '../config/database.config.js';
import { Baseline31Tablas1731888000001 } from './migrations/1731888000001-Baseline31Tablas.js';
import { FuncionesSeguridadAuth2fa1731888000002 } from './migrations/1731888000002-FuncionesSeguridadAuth2fa.js';
import { runInitialSeeds } from './seeds/initial.seed.js';

async function runMigrations(): Promise<void> {
  const appConfig = configuration();
  const baseOptions = buildPostgresDataSourceOptions({
    url: appConfig.database.migrationUrl,
    poolMax: 2,
    ssl: appConfig.database.ssl,
    applicationName: 'eticore-migrate',
    includeEntities: false,
  });

  const dataSource = new DataSource({
    ...baseOptions,
    migrations: [
      Baseline31Tablas1731888000001,
      FuncionesSeguridadAuth2fa1731888000002,
    ],
  });

  await dataSource.initialize();
  try {
    const executed = await dataSource.runMigrations({ transaction: 'all' });
    await runInitialSeeds(dataSource);
    console.log(
      JSON.stringify({
        event: 'migrations_completed',
        executedCount: executed.length,
        migrations: executed.map((m) => m.name),
      }),
    );
  } finally {
    await dataSource.destroy();
  }
}

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'migrations_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  });
