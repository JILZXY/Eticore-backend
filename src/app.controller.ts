import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({
    summary: 'Verificar estado de salud de la API y conexión con PostgreSQL',
    description:
      'Endpoint público sin prefijo /api/v1 usado por healthchecks de Docker y balanceadores.',
  })
  @ApiResponse({
    status: 200,
    description: 'Servicio y base de datos operativos ({ status: "ok" })',
  })
  getHealth(): Promise<{ status: 'ok' }> {
    return this.appService.getHealth();
  }
}
