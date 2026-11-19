import { DataSource } from 'typeorm';
import { configuration } from '../config/configuration.js';
import { buildPostgresDataSourceOptions } from '../config/database.config.js';
import { verificarPermisoEjecucionSeed } from './seeds/content-seed-guard.js';
import { runContentSeed } from './seeds/content.seed.js';

async function runSeedContenido(): Promise<void> {
  verificarPermisoEjecucionSeed(process.env);

  const appConfig = configuration();
  const baseOptions = buildPostgresDataSourceOptions({
    url: appConfig.database.migrationUrl,
    poolMax: 2,
    ssl: appConfig.database.ssl,
    applicationName: 'eticore-seed-contenido',
    includeEntities: false,
  });

  const dataSource = new DataSource(baseOptions);
  await dataSource.initialize();
  try {
    const resumen = await runContentSeed(dataSource, process.env);
    console.log(
      JSON.stringify({
        event: 'seed_contenido_completed',
        ...resumen,
      }),
    );
  } finally {
    await dataSource.destroy();
  }
}

runSeedContenido()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'seed_contenido_failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exit(1);
  });
