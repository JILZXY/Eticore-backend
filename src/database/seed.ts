import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration.js';
import { buildPostgresDataSourceOptions } from '../config/database.config.js';
import { runInitialSeeds } from './seeds/initial.seed.js';

async function runSeed(): Promise<void> {
  const appConfig = configuration();
  const baseOptions = buildPostgresDataSourceOptions({
    url: appConfig.database.migrationUrl,
    poolMax: 2,
    ssl: appConfig.database.ssl,
    applicationName: 'eticore-seed',
    includeEntities: false,
  });

  const dataSource = new DataSource(baseOptions);
  await dataSource.initialize();
  try {
    await runInitialSeeds(dataSource);
    console.log(JSON.stringify({ event: 'seeds_completed' }));
  } finally {
    await dataSource.destroy();
  }
}

runSeed()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'seeds_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  });
