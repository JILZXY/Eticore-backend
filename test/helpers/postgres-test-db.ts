import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { buildPostgresDataSourceOptions } from '../../src/config/database.config.js';
import { Baseline31Tablas1731888000001 } from '../../src/database/migrations/1731888000001-Baseline31Tablas.js';
import { runInitialSeeds } from '../../src/database/seeds/initial.seed.js';

export interface EphemeralTestDb {
  url: string;
  dataSource: DataSource;
  stop: () => Promise<void>;
}

function esperarMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startEphemeralPostgres(): Promise<EphemeralTestDb> {
  const urlExterna = process.env.TEST_DATABASE_URL;
  let containerId: string | null = null;
  let url = urlExterna;

  if (!url) {
    const dbCred = randomBytes(16).toString('hex');
    const dbNombre = 'eticore_test';
    const dbUsuario = 'eticore_test';

    containerId = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '-d',
        '-p',
        '127.0.0.1::5432',
        '-e',
        `POSTGRES_DB=${dbNombre}`,
        '-e',
        `POSTGRES_USER=${dbUsuario}`,
        '-e',
        `POSTGRES_PASSWORD=${dbCred}`,
        'postgres:18.6',
      ],
      { encoding: 'utf8' },
    ).trim();

    const salidaPuerto = execFileSync(
      'docker',
      ['port', containerId, '5432/tcp'],
      { encoding: 'utf8' },
    ).trim();

    const coincidencia = salidaPuerto.match(/:(\d+)\s*$/m);
    if (!coincidencia) {
      execFileSync('docker', ['rm', '-f', containerId]);
      throw new Error(`No se pudo obtener el puerto mapeado: ${salidaPuerto}`);
    }

    const puertoHost = coincidencia[1];
    url = `postgres://${dbUsuario}:${dbCred}@127.0.0.1:${puertoHost}/${dbNombre}`;
  }

  const baseOptions = buildPostgresDataSourceOptions({
    url,
    poolMax: 5,
    ssl: false,
    applicationName: 'eticore-e2e-setup',
    includeEntities: false,
  });

  const dataSource = new DataSource({
    ...baseOptions,
    migrations: [Baseline31Tablas1731888000001],
  });

  const limiteTiempo = Date.now() + 30_000;
  let conectado = false;
  let ultimoError: unknown;

  while (Date.now() < limiteTiempo && !conectado) {
    try {
      await dataSource.initialize();
      conectado = true;
    } catch (error: unknown) {
      ultimoError = error;
      await esperarMs(500);
    }
  }

  if (!conectado) {
    if (containerId) {
      try {
        execFileSync('docker', ['rm', '-f', containerId]);
      } catch {
        // Ignorar al limpiar contenedor fallido
      }
    }
    throw new Error(
      `PostgreSQL de prueba no estuvo listo a tiempo: ${
        ultimoError instanceof Error ? ultimoError.message : String(ultimoError)
      }`,
    );
  }

  try {
    await dataSource.runMigrations({ transaction: 'all' });
    await runInitialSeeds(dataSource);
  } catch (error: unknown) {
    await dataSource.destroy();
    if (containerId) {
      execFileSync('docker', ['rm', '-f', containerId]);
    }
    throw error;
  }

  return {
    url,
    dataSource,
    stop: async () => {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
      if (containerId) {
        execFileSync('docker', ['rm', '-f', containerId]);
      }
    },
  };
}
