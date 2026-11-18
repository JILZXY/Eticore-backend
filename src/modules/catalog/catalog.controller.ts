import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestConUsuario } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import {
  CatalogService,
  type DetalleUnidadPublica,
  type RespuestaCatalogo,
} from './catalog.service.js';
import { ConsultarCatalogoDto } from './dto/consultar-catalogo.dto.js';

@Controller('catalogo')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly sessionAuthGuard: SessionAuthGuard,
  ) {}

  @Get()
  @Public()
  async listarCatalogo(
    @Query() query: ConsultarCatalogoDto,
    @Req() req: RequestConUsuario,
  ): Promise<RespuestaCatalogo> {
    const usuario = await this.sessionAuthGuard.resolverUsuarioOpcional(req);
    return this.catalogService.listarCatalogo(query, usuario?.id);
  }

  @Get('unidades/:id')
  @UseGuards(SessionAuthGuard)
  obtenerUnidadPublicada(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DetalleUnidadPublica> {
    return this.catalogService.obtenerUnidadPublicada(id);
  }
}
