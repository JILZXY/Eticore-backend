import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class RetirarIntegranteGrupoDto {
  @ApiPropertyOptional({
    description:
      'Fecha de cierre del intervalo semiabierto [ingreso, salida) en formato ISO 8601 UTC (por defecto instante actual)',
    example: '2026-11-18T12:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'salida debe tener formato ISO 8601 válido' },
  )
  salida?: string;
}
