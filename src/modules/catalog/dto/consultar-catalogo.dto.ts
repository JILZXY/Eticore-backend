import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { TipoUnidad } from '../../../shared/validation/content-validator.service.js';

export type DificultadUnidad = 'basico' | 'intermedio' | 'especializado';
export type FiltroAvanceCatalogo = 'pendiente' | 'completada';

export class ConsultarCatalogoDto {
  @ApiPropertyOptional({
    description: 'Filtrar por identificador de tema',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tema_id debe ser un entero positivo' })
  @Min(1)
  tema_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por dificultad de la unidad publicada',
    enum: ['basico', 'intermedio', 'especializado'],
    example: 'basico',
  })
  @IsOptional()
  @IsIn(['basico', 'intermedio', 'especializado'], {
    message: 'dificultad debe ser basico, intermedio o especializado',
  })
  dificultad?: DificultadUnidad;

  @ApiPropertyOptional({
    description: 'Filtrar por tipo de actividad formativa',
    enum: ['aprende', 'normamatch', 'casotech'],
    example: 'aprende',
  })
  @IsOptional()
  @IsIn(['aprende', 'normamatch', 'casotech'], {
    message: 'tipo debe ser aprende, normamatch o casotech',
  })
  tipo?: TipoUnidad;

  @ApiPropertyOptional({
    description: 'Filtrar por unidades pertenecientes a una ruta formativa',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'ruta_id debe ser un entero positivo' })
  @Min(1)
  ruta_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de avance del usuario autenticado',
    enum: ['pendiente', 'completada'],
    example: 'pendiente',
  })
  @IsOptional()
  @IsIn(['pendiente', 'completada'], {
    message: 'avance debe ser pendiente o completada',
  })
  avance?: FiltroAvanceCatalogo;

  @ApiPropertyOptional({
    description: 'Término de búsqueda en título y descripción (ignora acentos y mayúsculas)',
    example: 'etica',
    maxLength: 120,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({
    description: 'Alias de q para búsqueda de texto',
    example: 'privacidad',
    maxLength: 120,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(120)
  busqueda?: string;

  @ApiPropertyOptional({
    description: 'Cursor opaco de paginación (base64url)',
    example: 'eyJpZCI6IjEwIn0',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Cantidad máxima de elementos por página (1 a 100, por defecto 20)',
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
