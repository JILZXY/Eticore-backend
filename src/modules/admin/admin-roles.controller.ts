import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import {
  AdminRolesService,
  type ResultadoCambioRol,
  type ResultadoRetiroRol,
} from './admin-roles.service.js';
import { CambiarRolUsuarioDto } from './dto/cambiar-rol-usuario.dto.js';

@Controller('admin/roles')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN_TECNICO')
export class AdminRolesController {
  constructor(private readonly adminRolesService: AdminRolesService) {}

  @Post('asignar')
  @HttpCode(HttpStatus.OK)
  asignarRol(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CambiarRolUsuarioDto,
  ): Promise<ResultadoCambioRol> {
    return this.adminRolesService.asignarRol(usuario.id, dto);
  }

  @Post('retirar')
  @HttpCode(HttpStatus.OK)
  retirarRol(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CambiarRolUsuarioDto,
  ): Promise<ResultadoRetiroRol> {
    return this.adminRolesService.retirarRol(usuario.id, dto);
  }
}
