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
  CurrentUser,
  type UsuarioAutenticado,
} from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
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

@Controller('rutas')
export class RoutesController {
  constructor(
    private readonly routesService: RoutesService,
    private readonly routesProgressService: RoutesProgressService,
  ) {}

  @Get()
  @Public()
  listarRutas(): Promise<RutaDisponibleItem[]> {
    return this.routesService.listarRutas();
  }

  @Post('me/cambiar')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  cambiarRuta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CambiarRutaDto,
  ): Promise<InscripcionRutaResultado> {
    return this.routesService.cambiarRuta(usuario.id, dto);
  }

  @Get('me/progreso')
  @UseGuards(SessionAuthGuard)
  obtenerProgreso(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() query: ConsultarProgresoRutaDto,
  ): Promise<RespuestaProgresoRuta> {
    return this.routesProgressService.obtenerProgreso(usuario.id, query);
  }

  @Post(':id/elegir')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  elegirRuta(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<InscripcionRutaResultado> {
    return this.routesService.elegirRuta(usuario.id, id);
  }
}
