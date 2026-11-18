import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import {
  AttemptsFinalizationService,
  type ResultadoFinalizacionIntento,
} from './attempts-finalization.service.js';
import {
  AttemptsStepService,
  type RespuestaPasoIntento,
} from './attempts-step.service.js';
import {
  AttemptsService,
  type IntentoDetalle,
  type RespuestaHistorialIntentos,
  type ResultadoIntentoHistorico,
} from './attempts.service.js';
import { ConsultarHistorialDto } from './dto/consultar-historial.dto.js';
import { CrearIntentoDto } from './dto/crear-intento.dto.js';
import { FinalizarIntentoDto } from './dto/finalizar-intento.dto.js';
import { GuardarPasoDto } from './dto/guardar-paso.dto.js';

@Controller('intentos')
@UseGuards(SessionAuthGuard)
export class AttemptsController {
  constructor(
    private readonly attemptsService: AttemptsService,
    private readonly attemptsStepService: AttemptsStepService,
    private readonly attemptsFinalizationService: AttemptsFinalizationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  crearIntento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearIntentoDto,
  ): Promise<IntentoDetalle> {
    return this.attemptsService.crearIntento(usuario.id, dto);
  }

  @Get('me/historial')
  listarHistorial(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() query: ConsultarHistorialDto,
  ): Promise<RespuestaHistorialIntentos> {
    return this.attemptsService.listarHistorial(usuario.id, query);
  }

  @Get(':id')
  obtenerIntento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IntentoDetalle> {
    return this.attemptsService.obtenerIntento(usuario.id, id);
  }

  @Patch(':id/paso')
  guardarPaso(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuardarPasoDto,
  ): Promise<RespuestaPasoIntento> {
    return this.attemptsStepService.guardarPaso(usuario.id, id, dto);
  }

  @Post(':id/finalizar')
  @HttpCode(HttpStatus.OK)
  finalizarIntento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FinalizarIntentoDto,
    @Req() req: Request,
  ): Promise<ResultadoFinalizacionIntento> {
    const cuerpoCrudo =
      typeof req.body === 'object' && req.body !== null
        ? (req.body as Record<string, unknown>)
        : undefined;
    return this.attemptsFinalizationService.finalizarIntento(
      usuario.id,
      id,
      dto,
      cuerpoCrudo,
    );
  }

  @Get(':id/resultado')
  obtenerResultado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResultadoIntentoHistorico> {
    return this.attemptsService.obtenerResultado(usuario.id, id);
  }
}
