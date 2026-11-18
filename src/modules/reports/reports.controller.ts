import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { ConsultarReporteGrupoDto } from './dto/consultar-reporte-grupo.dto.js';
import {
  ReportsService,
  type RespuestaReporteGrupo,
} from './reports.service.js';

@Controller('reportes')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('grupos/:id')
  @Roles('ADMIN_TECNICO', 'ADMIN_CONTENIDO')
  obtenerReporteGrupo(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ConsultarReporteGrupoDto,
  ): Promise<RespuestaReporteGrupo> {
    return this.reportsService.obtenerReporteGrupo(id, query);
  }
}
