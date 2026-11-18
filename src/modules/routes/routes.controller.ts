import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
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
import { Public } from '../../common/decorators/public.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import { CambiarRutaDto } from './dto/cambiar-ruta.dto.js';
import { ConsultarProgresoRutaDto } from './dto/consultar-progreso-ruta.dto.js';
import {
  type RespuestaProgresoRuta,
  RoutesProgressService,
} from './routes-progress.service.js';
import {
  type InscripcionRutaResultado,
  RoutesService,
  type RutaDisponibleItem,
} from './routes.service.js';

@ApiTags('Rutas')
@Controller('rutas')
export class RoutesController {
  constructor(
    private readonly routesService: RoutesService,
    private readonly routesProgressService: RoutesProgressService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Listar rutas formativas activas con su versión vigente',
  })
  @ApiResponse({ status: 200, description: 'Lista de rutas disponibles' })
  listarRutas(): Promise<RutaDisponibleItem[]> {
    return this.routesService.listarRutas();
  }

  @Post('me/cambiar')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Cambiar de ruta formativa conservando inscripciones anteriores por separado',
    description:
      'Crea o reutiliza la inscripción contra la versión actual de la ruta elegida sin migrar ni borrar inscripciones previas (REQ-F-70, RN-08).',
  })
  @ApiResponse({ status: 200, description: 'Inscripción activa actualizada' })
  cambiarRuta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CambiarRutaDto,
  ): Promise<InscripcionRutaResultado> {
    return this.routesService.cambiarRuta(usuario.id, dto);
  }

  @Get('me/progreso')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiOperation({
    summary: 'Consultar progreso derivado contra la versión de ruta asignada a la inscripción',
    description:
      'Calcula créditos sobre unidades obligatorias de la versión inscrita. Si el denominador es 0 devuelve estado="Sin actividades" y porcentaje=null (nunca 100 % falso; RN-23).',
  })
  @ApiResponse({ status: 200, description: 'Progreso derivado de la inscripción y listado de inscripciones' })
  obtenerProgreso(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() query: ConsultarProgresoRutaDto,
  ): Promise<RespuestaProgresoRuta> {
    return this.routesProgressService.obtenerProgreso(usuario.id, query);
  }

  @Post(':id/elegir')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiParam({ name: 'id', type: Number, description: 'ID de la ruta a elegir' })
  @ApiOperation({
    summary: 'Elegir una ruta formativa (crea inscripción contra su versión actual si falta)',
  })
  @ApiResponse({ status: 200, description: 'Inscripción a la ruta confirmada' })
  @ApiResponse({ status: 404, description: 'Ruta no encontrada o inactiva' })
  elegirRuta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InscripcionRutaResultado> {
    return this.routesService.elegirRuta(usuario.id, id);
  }
}
