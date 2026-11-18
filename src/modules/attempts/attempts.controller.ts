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
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
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

@ApiTags('Intentos')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
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
  @ApiOperation({
    summary: 'Iniciar o recuperar idempotentemente un intento con UUID y versión fija',
    description:
      'Bloquea la fila usuario para calcular el ordinal sin carreras, fija la version_unidad publicada actual y proyecta el contenido sin respuestas.',
  })
  @ApiResponse({ status: 201, description: 'Intento creado o recuperado por UUID' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada o desactivada' })
  crearIntento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CrearIntentoDto,
  ): Promise<IntentoDetalle> {
    return this.attemptsService.crearIntento(usuario.id, dto);
  }

  @Get('me/historial')
  @ApiOperation({
    summary: 'Listar historial paginado de intentos propios (cabeceras sin recorrido)',
  })
  @ApiResponse({ status: 200, description: 'Cabeceras de intentos paginadas por cursor' })
  listarHistorial(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() query: ConsultarHistorialDto,
  ): Promise<RespuestaHistorialIntentos> {
    return this.attemptsService.listarHistorial(usuario.id, query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'UUID del intento' })
  @ApiOperation({
    summary: 'Reanudar o consultar un intento propio con la versión exacta fijada',
  })
  @ApiResponse({ status: 200, description: 'Detalle del intento y versión fijada proyectada' })
  @ApiResponse({ status: 404, description: 'Intento no encontrado o ajeno' })
  obtenerIntento(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<IntentoDetalle> {
    return this.attemptsService.obtenerIntento(usuario.id, id);
  }

  @Patch(':id/paso')
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'UUID del intento' })
  @ApiOperation({
    summary: 'Guardar avance parcial en un intento en curso con revisión optimista',
    description:
      'Valida la transición contra la versión fijada y actualiza recorrido incrementando revision. Devuelve 409 si la revisión no coincide.',
  })
  @ApiResponse({ status: 200, description: 'Paso guardado y revisión incrementada' })
  @ApiResponse({ status: 409, description: 'Revisión desactualizada (REVISION_DESACTUALIZADA) o intento ya finalizado' })
  guardarPaso(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GuardarPasoDto,
  ): Promise<RespuestaPasoIntento> {
    return this.attemptsStepService.guardarPaso(usuario.id, id, dto);
  }

  @Post(':id/finalizar')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'UUID del intento' })
  @ApiOperation({
    summary: 'Finalizar intento transaccionalmente (nota en servidor + crédito + insignias)',
    description:
      'Bloquea usuario e intento; si ya está finalizado devuelve el resultado confirmado (idempotente). Calcula la calificación en servidor (Aprende NULL, NormaMatch 100*aciertos/total, CasoTech 100*suma/(2*decisiones)) y acredita puntos en primera finalización.',
  })
  @ApiResponse({ status: 200, description: 'Resultado confirmado, crédito e insignias otorgadas' })
  @ApiResponse({ status: 422, description: 'Recorrido incompleto o inválido para finalizar' })
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
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'UUID del intento finalizado' })
  @ApiOperation({
    summary: 'Consultar resultado histórico y retroalimentación de la versión cursada',
    description:
      'Devuelve la calificación y las explicaciones de la versión exacta que cursó el intento, aunque la unidad tenga una versión posterior publicada.',
  })
  @ApiResponse({ status: 200, description: 'Resultado histórico con explicaciones de la versión fijada' })
  obtenerResultado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResultadoIntentoHistorico> {
    return this.attemptsService.obtenerResultado(usuario.id, id);
  }
}
