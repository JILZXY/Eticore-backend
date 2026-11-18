import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import type { RequestConUsuario } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import {
  CatalogService,
  type DetalleUnidadPublica,
  type RespuestaCatalogo,
} from './catalog.service.js';
import { ConsultarCatalogoDto } from './dto/consultar-catalogo.dto.js';

@ApiTags('Catálogo')
@Controller('catalogo')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly sessionAuthGuard: SessionAuthGuard,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Listar catálogo de unidades formativas publicadas con filtros y búsqueda',
    description:
      'Devuelve metadatos paginados por cursor sin cargar el contenido JSONB completo. Si hay sesión activa permite filtrar por avance (pendiente/completada).',
  })
  @ApiResponse({ status: 200, description: 'Listado paginado del catálogo' })
  async listarCatalogo(
    @Query() query: ConsultarCatalogoDto,
    @Req() req: RequestConUsuario,
  ): Promise<RespuestaCatalogo> {
    const usuario = await this.sessionAuthGuard.resolverUsuarioOpcional(req);
    return this.catalogService.listarCatalogo(query, usuario?.id);
  }

  @Get('unidades/:id')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth(SWAGGER_COOKIE_AUTH)
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad formativa' })
  @ApiOperation({
    summary: 'Abrir detalle de unidad publicada con contenido proyectado para aprendiz',
    description:
      'Proyecta únicamente enunciados, secciones y opciones; nunca expone respuestas correctas ni ponderaciones.',
  })
  @ApiResponse({ status: 200, description: 'Detalle de unidad publicada y fuentes' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada o no publicada' })
  obtenerUnidadPublicada(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DetalleUnidadPublica> {
    return this.catalogService.obtenerUnidadPublicada(id);
  }
}
