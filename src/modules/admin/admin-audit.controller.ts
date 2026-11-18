import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import {
  AdminAuditService,
  type RespuestaAuditoriaAdmin,
} from './admin-audit.service.js';
import { ConsultarAuditoriaAdminDto } from './dto/consultar-auditoria-admin.dto.js';

@ApiTags('Admin')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('admin/auditoria')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN_TECNICO')
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Consultar bitácora de auditoría de aplicación o de BD (solo ADMIN_TECNICO)',
    description:
      'Opera en modo solo lectura a través de la conexión eticore_auditoria (AUDIT_DATA_SOURCE), paginando descendentemente sobre auditoria o auditoria_bd.',
  })
  @ApiResponse({ status: 200, description: 'Registros de auditoría paginados por cursor' })
  listarAuditoria(
    @Query() query: ConsultarAuditoriaAdminDto,
  ): Promise<RespuestaAuditoriaAdmin> {
    return this.adminAuditService.listarAuditoria(query);
  }
}
