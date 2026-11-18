import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  CatalogService,
  type DetalleUnidadPublica,
} from './catalog.service.js';

@Controller('catalogo/unidades')
export class CatalogMuestraController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get(':id/muestra')
  @Public()
  obtenerMuestraPublica(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DetalleUnidadPublica> {
    return this.catalogService.obtenerMuestraPublica(id);
  }
}
