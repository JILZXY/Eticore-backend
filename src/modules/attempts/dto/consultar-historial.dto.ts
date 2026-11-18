import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ConsultarHistorialDto {
  @ApiPropertyOptional({
    description: 'Filtrar historial por identificador de unidad formativa',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'unidad_id debe ser un entero positivo' })
  @Min(1)
  unidad_id?: number;

  @ApiPropertyOptional({
    description: 'Cursor opaco de paginación del historial',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Cantidad de elementos por página (1 a 100, por defecto 20)',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero entre 1 y 100' })
  @Min(1)
  @Max(100)
  limit?: number;
}
