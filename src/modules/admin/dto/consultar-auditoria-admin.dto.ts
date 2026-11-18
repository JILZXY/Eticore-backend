import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    description:
      'Fuente de auditoría: aplicacion (tabla auditoria) o bd (tabla auditoria_bd alimentada por triggers)',
    enum: ['aplicacion', 'bd'],
    default: 'aplicacion',
    example: 'aplicacion',
  })
  @IsOptional()
  @IsIn(['aplicacion', 'bd'], {
    message: 'fuente debe ser aplicacion o bd',
  })
  fuente?: FuenteAuditoria;

  @ApiPropertyOptional({
    description: 'Filtrar por código de acción (en aplicacion) u operación SQL (en bd)',
    example: 'publicar_version',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(64)
  accion?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por identificador del actor (solo en fuente=aplicacion)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'actor_id debe ser un entero positivo' })
  @Min(1)
  actor_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de recurso (en aplicacion) o nombre de tabla (en bd)',
    example: 'version_unidad',
    maxLength: 40,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(40)
  recurso_tipo?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por resultado de la acción (solo en fuente=aplicacion)',
    enum: ['exitoso', 'rechazado', 'fallido'],
    example: 'exitoso',
  })
  @IsOptional()
  @IsIn(['exitoso', 'rechazado', 'fallido'], {
    message: 'resultado debe ser exitoso, rechazado o fallido',
  })
  resultado?: ResultadoAuditoria;

  @ApiPropertyOptional({
    description: 'Cursor opaco de paginación descendente',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Límite de registros por página (1 a 100, por defecto 20)',
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
