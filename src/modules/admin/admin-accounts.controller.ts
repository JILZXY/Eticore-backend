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
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
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
  AdminAccountsService,
  type CuentaAdminItem,
  type RespuestaListadoCuentasAdmin,
  type ResultadoDesactivarCuenta,
} from './admin-accounts.service.js';
import { ListarCuentasAdminDto } from './dto/listar-cuentas-admin.dto.js';

@ApiTags('Admin')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('admin/cuentas')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('ADMIN_TECNICO')
export class AdminAccountsController {
  constructor(private readonly adminAccountsService: AdminAccountsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar cuentas con proyección mínima y paginación por cursor (solo ADMIN_TECNICO)',
    description:
      'Nunca expone hashes Argon2id, secretos TOTP, hashes de sesión ni recorridos de actividades (RN-12, C-06).',
  })
  @ApiResponse({ status: 200, description: 'Listado paginado de cuentas' })
  listarCuentas(
    @Query() query: ListarCuentasAdminDto,
  ): Promise<RespuestaListadoCuentasAdmin> {
    return this.adminAccountsService.listarCuentas(query);
  }

  @Patch(':id/activar')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID del usuario a activar' })
  @ApiOperation({
    summary: 'Activar una cuenta de usuario',
  })
  @ApiResponse({ status: 200, description: 'Cuenta activada y auditada' })
  activarCuenta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<CuentaAdminItem> {
    return this.adminAccountsService.activarCuenta(usuario.id, id);
  }

  @Patch(':id/desactivar')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: Number, description: 'ID del usuario a desactivar' })
  @ApiOperation({
    summary: 'Desactivar cuenta revocando todas sus sesiones en la misma transacción (RN-29)',
    description:
      'Bloquea guarda_integridad (admin_tecnico_activo) con FOR UPDATE antes de contar técnicos activos; rechaza con 409 si es el último ADMIN_TECNICO activo.',
  })
  @ApiResponse({ status: 200, description: 'Cuenta desactivada y sesiones revocadas' })
  @ApiResponse({ status: 409, description: 'Prohibido desactivar el último ADMIN_TECNICO activo (ULTIMO_ADMIN_TECNICO_ACTIVO)' })
  desactivarCuenta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ResultadoDesactivarCuenta> {
    return this.adminAccountsService.desactivarCuenta(usuario.id, id);
  }
}
