import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ConsultarProgresoRutaDto {
  @ApiPropertyOptional({
    description: 'Identificador de ruta para consultar la inscripción más reciente a esa ruta',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id?: number;

  @ApiPropertyOptional({
    description: 'Identificador exacto de inscripcion_ruta a consultar',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'inscripcion_id debe ser un entero positivo' })
  @Min(1)
  inscripcion_id?: number;
}
