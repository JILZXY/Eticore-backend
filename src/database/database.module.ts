import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfiguration } from '../config/configuration.js';
import { buildPostgresDataSourceOptions } from '../config/database.config.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfiguration, true>) => {
        const db = configService.get('database', { infer: true });
        return {
          ...buildPostgresDataSourceOptions({
            url: db.url,
            poolMax: db.poolMax,
            ssl: db.ssl,
            applicationName: 'eticore-api',
          }),
          autoLoadEntities: false,
          retryAttempts: 10,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
