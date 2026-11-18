import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Query,
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
  AdminAccountsService,
  type CuentaAdminItem,
  type RespuestaListadoCuentasAdmin,
  type ResultadoDesactivarCuenta,
} from './admin-accounts.service.js';
import { ListarCuentasAdminDto } from './dto/listar-cuentas-admin.dto.js';

@Controller('admin/cuentas')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN_TECNICO')
export class AdminAccountsController {
  constructor(private readonly adminAccountsService: AdminAccountsService) {}

  @Get()
  listarCuentas(
    @Query() query: ListarCuentasAdminDto,
  ): Promise<RespuestaListadoCuentasAdmin> {
    return this.adminAccountsService.listarCuentas(query);
  }

  @Patch(':id/activar')
  @HttpCode(HttpStatus.OK)
  activarCuenta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CuentaAdminItem> {
    return this.adminAccountsService.activarCuenta(usuario.id, id);
  }

  @Patch(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  desactivarCuenta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ResultadoDesactivarCuenta> {
    return this.adminAccountsService.desactivarCuenta(usuario.id, id);
  }
}
