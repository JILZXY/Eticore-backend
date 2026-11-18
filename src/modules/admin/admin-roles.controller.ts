import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import {
  AdminRolesService,
  type ResultadoCambioRol,
  type ResultadoRetiroRol,
} from './admin-roles.service.js';
import { CambiarRolUsuarioDto } from './dto/cambiar-rol-usuario.dto.js';

@ApiTags('Admin')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('admin/roles')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN_TECNICO')
export class AdminRolesController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @Post('asignar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Asignar rol del catálogo fijo a un usuario (solo ADMIN_TECNICO)',
  })
  @ApiResponse({ status: 200, description: 'Rol asignado y auditado' })
  asignarRol(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CambiarRolUsuarioDto,
  ): Promise<ResultadoCambioRol> {
    return this.adminRolesService.asignarRol(usuario.id, dto);
  }

  @Post('retirar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retirar rol de un usuario con guarda de último ADMIN_TECNICO activo (RN-29)',
    description:
      'Bloquea guarda_integridad con FOR UPDATE antes de contar técnicos activos y rechaza con 409 si dejaría al sistema sin ADMIN_TECNICO activo.',
  })
  @ApiResponse({ status: 200, description: 'Rol retirado y auditado' })
  @ApiResponse({ status: 409, description: 'Prohibido retirar el último ADMIN_TECNICO activo (ULTIMO_ADMIN_TECNICO_ACTIVO)' })
  retirarRol(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CambiarRolUsuarioDto,
  ): Promise<ResultadoRetiroRol> {
    return this.adminRolesService.retirarRol(usuario.id, dto);
  }
}
