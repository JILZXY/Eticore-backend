import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import type { UsuarioPublico } from '../auth/auth.service.js';
import { ActualizarPerfilDto } from './dto/actualizar-perfil.dto.js';
import { UsersService } from './users.service.js';

@Controller('usuarios')
@UseGuards(SessionAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  obtenerPerfilPropio(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<UsuarioPublico> {
    return this.usersService.obtenerPerfilPropio(usuario.id);
  }

  @Patch('me')
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
