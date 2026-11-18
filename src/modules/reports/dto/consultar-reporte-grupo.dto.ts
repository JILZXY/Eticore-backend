import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class ConsultarReporteGrupoDto {
  @ApiProperty({
    description:
      'Inicio del periodo semiabierto [desde, hasta) sobre intento.finalizacion (ISO 8601 UTC)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsISO8601(
    { strict: true },
    { message: 'desde debe tener formato ISO 8601 válido' },
  )
  desde!: string;

  @ApiProperty({
    description:
      'Fin exclusivo del periodo semiabierto [desde, hasta) sobre intento.finalizacion (ISO 8601 UTC)',
    example: '2026-12-01T00:00:00.000Z',
  })
  @IsISO8601(
    { strict: true },
    { message: 'hasta debe tener formato ISO 8601 válido' },
  )
  hasta!: string;

  @ApiPropertyOptional({
    description: 'Filtrar intentos elegibles por unidad formativa antes de agrupar',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'unidad_id debe ser un entero positivo' })
  @Min(1)
  unidad_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar intentos elegibles por ruta formativa antes de agrupar',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id?: number;
}
