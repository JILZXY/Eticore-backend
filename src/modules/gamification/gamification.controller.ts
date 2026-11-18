import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import {
  GamificationService,
  type InsigniaUsuarioItem,
  type ResumenPuntos,
  type ResumenRango,
} from './gamification.service.js';

@Controller('gamificacion')
@UseGuards(SessionAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('me/puntos')
  obtenerPuntos(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ResumenPuntos> {
    return this.gamificationService.obtenerPuntos(usuario.id);
  }

  @Get('me/insignias')
  obtenerInsignias(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<InsigniaUsuarioItem[]> {
    return this.gamificationService.obtenerInsignias(usuario.id);
  }

  @Get('me/rango')
  obtenerRango(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ResumenRango> {
    return this.gamificationService.obtenerRango(usuario.id);
  }
}
