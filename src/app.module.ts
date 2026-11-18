import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { configuration, validateEnv } from './config/configuration.js';
import { DatabaseModule } from './database/database.module.js';
import { AttemptsModule } from './modules/attempts/attempts.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { GamificationModule } from './modules/gamification/gamification.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuditModule } from './shared/audit/audit.module.js';
import { ValidationModule } from './shared/validation/validation.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuditModule,
    ValidationModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    GamificationModule,
    AttemptsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
