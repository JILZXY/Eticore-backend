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
  @IsOptional()
  @Transform(transformarBooleanoOpcional)
  @IsBoolean({ message: 'activo debe ser booleano' })
  activo?: boolean;

  @IsOptional()
  @IsIn(['APRENDIZ', 'ADMIN_CONTENIDO', 'ADMIN_TECNICO'], {
    message: 'rol debe ser APRENDIZ, ADMIN_CONTENIDO o ADMIN_TECNICO',
  })
  rol?: RolCodigo;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero entre 1 y 100' })
  @Min(1)
  @Max(100)
  limit?: number;
}
