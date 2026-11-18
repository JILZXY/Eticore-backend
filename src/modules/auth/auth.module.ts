import { Module } from '@nestjs/common';
import { OwnershipGuard } from '../../common/guards/ownership.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { AuthDatabaseModule } from '../../database/auth-database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [AuthDatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, SessionAuthGuard, RolesGuard, OwnershipGuard],
  exports: [AuthService, SessionAuthGuard, RolesGuard, OwnershipGuard],
})
export class AuthModule {}
