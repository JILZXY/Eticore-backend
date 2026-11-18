import {
  Inject,
  Module,
  Optional,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { AppConfiguration } from '../config/configuration.js';
import { buildPostgresDataSourceOptions } from '../config/database.config.js';

export const AUDIT_DATA_SOURCE = Symbol('AUDIT_DATA_SOURCE');

@Module({
  providers: [
    {
      provide: AUDIT_DATA_SOURCE,
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService<AppConfiguration, true>,
      ): Promise<DataSource> => {
        const db = configService.get('database', { infer: true });
        const dataSource = new DataSource(
          buildPostgresDataSourceOptions({
            url: db.auditUrl,
            poolMax: Math.max(2, Math.min(db.poolMax, 5)),
            ssl: db.ssl,
            applicationName: 'eticore-auditoria',
            includeEntities: false,
          }),
        );
        return dataSource.initialize();
      },
    },
  ],
  exports: [AUDIT_DATA_SOURCE],
})
export class AuditDatabaseModule implements OnModuleDestroy {
  constructor(
    @Optional()
    @Inject(AUDIT_DATA_SOURCE)
    private readonly dataSource?: DataSource,
  ) {}

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
