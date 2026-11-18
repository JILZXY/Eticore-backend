import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { SWAGGER_COOKIE_AUTH } from '../../config/openapi.config.js';
import { ConsultarReporteGrupoDto } from './dto/consultar-reporte-grupo.dto.js';
import {
  ReportsService,
  type RespuestaReporteGrupo,
} from './reports.service.js';

@ApiTags('Reportes')
@ApiCookieAuth(SWAGGER_COOKIE_AUTH)
@Controller('reportes')
@UseGuards(SessionAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('grupos/:id')
  @Roles('ADMIN_TECNICO', 'ADMIN_CONTENIDO')
  @ApiParam({ name: 'id', type: Number, description: 'ID del grupo a reportar' })
  @ApiOperation({
    summary: 'Generar reporte agregado de grupo por periodo y versión con supresión < 5 (A50, RN-13)',
    description:
      'Ejecuta una sola consulta SQL con CTEs (elegibles -> mejores -> promedios -> conteos). Verifica pertenencia temporal con EXISTS sobre [ingreso, salida) en intento.finalizacion, toma la mejor nota por (usuario, version_id) y suprime el promedio (null) cuando una celda tiene menos de 5 participantes. Aprende devuelve promedio="No aplica".',
  })
  @ApiResponse({ status: 200, description: 'Reporte agregado por versión (nunca devuelve filas individuales)' })
  @ApiResponse({ status: 400, description: 'Periodo [desde, hasta) inválido' })
  @ApiResponse({ status: 404, description: 'Grupo no encontrado' })
  obtenerReporteGrupo(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ConsultarReporteGrupoDto,
  ): Promise<RespuestaReporteGrupo> {
    return this.reportsService.obtenerReporteGrupo(id, query);
  }
}
