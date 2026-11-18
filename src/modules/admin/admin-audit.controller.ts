import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import {
  AdminAuditService,
  type RespuestaAuditoriaAdmin,
} from './admin-audit.service.js';
import { ConsultarAuditoriaAdminDto } from './dto/consultar-auditoria-admin.dto.js';

@Controller('admin/auditoria')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN_TECNICO')
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get()
  listarAuditoria(
    @Query() query: ConsultarAuditoriaAdminDto,
  ): Promise<RespuestaAuditoriaAdmin> {
    return this.adminAuditService.listarAuditoria(query);
  }
}
