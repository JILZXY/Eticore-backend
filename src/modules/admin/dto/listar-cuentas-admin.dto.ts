import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import type { RolCodigo } from '../../../common/decorators/roles.decorator.js';

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

export class ListarCuentasAdminDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado activo/inactivo de la cuenta',
    example: true,
  })
  @IsOptional()
  @Transform(transformarBooleanoOpcional)
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar por código de rol asignado',
    enum: ['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'],
    example: 'APRENDIZ',
  })
  @IsOptional()
  @IsIn(['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'], {
    message: 'rol debe ser APRENDIZ, ADMIN_CONTENIDO o ADMIN_TECNICO',
  })
  rol?: RolCodigo;

  @ApiPropertyOptional({
    description: 'Cursor opaco de paginación',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Límite de cuentas por página (1 a 100, por defecto 20)',
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
