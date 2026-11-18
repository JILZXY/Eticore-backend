import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import type { UsuarioPublico } from '../auth/auth.service.js';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Usuarios')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('usuarios')
@UseGuards(SessionAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Consultar perfil propio del usuario autenticado',
    description:
      'Devuelve datos mínimos de la cuenta y roles vigentes (RN-12).',
  })
  @ApiResponse({ status: 200, description: 'Perfil propio del usuario' })
  @ApiResponse({ status: 401, description: 'Sesión inválida o expirada' })
  obtenerPerfilPropio(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<UsuarioPublico> {
    return this.usersService.obtenerPerfilPropio(usuario.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Actualizar perfil propio (nombre de visualización y ruta preferida)',
    description:
      'El correo electrónico no es editable en autoservicio (REQ-F-07).',
  })
  @ApiResponse({ status: 200, description: 'Perfil actualizado' })
  @ApiResponse({
    status: 400,
    description: 'Intento de editar correo o datos inválidos',
  })
  actualizarPerfilPropio(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: ActualizarPerfilDto,
    @Req() req: Request,
  ): Promise<UsuarioPublico> {
    const cuerpoCrudo =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : undefined;
    return this.usersService.actualizarPerfilPropio(
      usuario.id,
      dto,
      cuerpoCrudo,
    );
  }
}
