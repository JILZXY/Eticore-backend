import { Controller, Get, UseGuards } from '@nestjs/common';
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
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import {
  GamificationService,
  type InsigniaUsuarioItem,
  type ResumenPuntos,
  type ResumenRango,
} from './gamification.service.js';

@ApiTags('Gamificación')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('gamificacion')
@UseGuards(SessionAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get('me/puntos')
  @ApiOperation({
    summary: 'Consultar saldo global de puntos derivados de credito_unidad',
    description:
      'Suma global por cuenta de los créditos confirmados (10 por Aprende, 20 por NormaMatch/CasoTech, una sola vez por unidad; RN-06, RN-24).',
  })
  @ApiResponse({ status: 200, description: 'Saldo total y desglose de créditos por unidad' })
  obtenerPuntos(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ResumenPuntos> {
    return this.gamificationService.obtenerPuntos(usuario.id);
  }

  @Get('me/insignias')
  @ApiOperation({
    summary: 'Listar insignias obtenidas con su origen verificable (intento o inscripción)',
  })
  @ApiResponse({ status: 200, description: 'Lista de insignias obtenidas por la cuenta' })
  obtenerInsignias(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<InsigniaUsuarioItem[]> {
    return this.gamificationService.obtenerInsignias(usuario.id);
  }

  @Get('me/rango')
  @ApiOperation({
    summary: 'Consultar rango actual y progreso hacia siguiente umbral (100 y 300 puntos)',
  })
  @ApiResponse({ status: 200, description: 'Rango derivado del saldo de puntos actual' })
  obtenerRango(
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<ResumenRango> {
    return this.gamificationService.obtenerRango(usuario.id);
  }
}
