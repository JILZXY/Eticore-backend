import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ResultadoAuditoria } from '../../../shared/audit/audit.service.js';

export type FuenteAuditoria = 'aplicacion' | 'bd';

export class ConsultarAuditoriaAdminDto {
  @IsOptional()
  @IsIn(['aplicacion', 'bd'], {
    message: 'fuente debe ser aplicacion o bd',
  })
  fuente?: FuenteAuditoria;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(64)
  accion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'actor_id debe ser un entero positivo' })
  @Min(1)
  actor_id?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(40)
  recurso_tipo?: string;

  @IsOptional()
  @IsIn(['exitoso', 'rechazado', 'fallido'], {
    message: 'resultado debe ser exitoso, rechazado o fallido',
  })
  resultado?: ResultadoAuditoria;

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
