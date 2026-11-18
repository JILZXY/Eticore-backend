import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

function transformarBooleanoOpcional({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalizado = value.trim().toLowerCase();
    if (normalizado === 'true' || normalizado === '1') {
      return true;
    }
    if (normalizado === 'false' || normalizado === '0') {
      return false;
    }
  }
  return value;
}

export class ListarIntegrantesGrupoDto {
  @ApiPropertyOptional({
    description: 'Si es true, devuelve solo membresías abiertas (salida IS NULL)',
    example: true,
  })
  @IsOptional()
  @Transform(transformarBooleanoOpcional)
  @IsBoolean({ message: 'solo_activos debe ser booleano' })
  solo_activos?: boolean;

  @ApiPropertyOptional({
    description: 'Cursor opaco de paginación',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Límite de resultados por página (1 a 100, por defecto 20)',
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
