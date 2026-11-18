import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  CatalogService,
  type DetalleUnidadPublica,
} from './catalog.service.js';

@ApiTags('Catálogo')
@Controller('catalogo/unidades')
export class CatalogMuestraController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get(':id/muestra')
  @Public()
  @ApiParam({ name: 'id', type: Number, description: 'ID de la unidad con muestra pública' })
  @ApiOperation({
    summary: 'Consultar muestra pública de una unidad sin iniciar sesión (RN-03)',
    description:
      'Solo accesible para unidades publicadas con muestra_publica=true. No crea sesión ni guarda progreso.',
  })
  @ApiResponse({ status: 200, description: 'Muestra pública proyectada sin respuestas' })
  @ApiResponse({ status: 404, description: 'Unidad no encontrada o no habilitada como muestra pública' })
  obtenerMuestraPublica(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DetalleUnidadPublica> {
    return this.catalogService.obtenerMuestraPublica(id);
  }
}
