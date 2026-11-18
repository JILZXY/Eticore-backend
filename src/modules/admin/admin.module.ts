import { Module } from '@nestjs/common';
import { AuditDatabaseModule } from '../../database/audit-database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAccountsController } from './admin-accounts.controller.js';
import { AdminAccountsService } from './admin-accounts.service.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminRolesController } from './admin-roles.controller.js';
import { AdminRolesService } from './admin-roles.service.js';

@Module({
  imports: [AuthModule, AuditDatabaseModule],
  controllers: [
    AdminAccountsController,
    AdminRolesController,
    AdminAuditController,
  ],
  providers: [AdminAccountsService, AdminRolesService, AdminAuditService],
  exports: [AdminAccountsService, AdminRolesService, AdminAuditService],
})
export class AdminModule {}
