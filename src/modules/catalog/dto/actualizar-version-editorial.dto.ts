import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { DificultadUnidad } from './consultar-catalogo.dto.js';
import { FuenteCitaEditorialDto } from './crear-version-editorial.dto.js';

export class ActualizarVersionEditorialDto {
  @ApiPropertyOptional({
    description: 'Revisión optimista esperada del borrador (409 si no coincide)',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'revision_esperada debe ser un entero positivo' })
  @Min(1)
  revision_esperada?: number;

  @ApiPropertyOptional({
    description: 'Nuevo título del borrador',
    example: 'Minimización de Datos — Edición Revisada',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'titulo debe ser una cadena de texto' })
  @MinLength(1, { message: 'titulo no puede estar vacío' })
  @MaxLength(200, { message: 'titulo no puede exceder 200 caracteres' })
  titulo?: string;

  @ApiPropertyOptional({
    description: 'Nueva descripción del borrador',
    example: 'Descripción actualizada del borrador antes de revisión.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'descripcion debe ser una cadena de texto' })
  @MinLength(1, { message: 'descripcion no puede estar vacía' })
  descripcion?: string;

  @ApiPropertyOptional({
    description: 'Identificador del tema',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tema_id debe ser un entero positivo' })
  @Min(1)
  tema_id?: number;

  @ApiPropertyOptional({
    description: 'Nivel de dificultad',
    enum: ['basico', 'intermedio', 'especializado'],
    example: 'intermedio',
  })
  @IsOptional()
  @IsIn(['basico', 'intermedio', 'especializado'], {
    message: 'dificultad debe ser basico, intermedio o especializado',
  })
  dificultad?: DificultadUnidad;

  @ApiPropertyOptional({
    description: 'Versión del esquema JSON del contenido',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'esquema_version debe ser un entero positivo' })
  @Min(1)
  esquema_version?: number;

  @ApiPropertyOptional({
    description: 'Contenido JSONB actualizado (máximo 1 MiB)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject({ message: 'contenido debe ser un objeto JSON' })
  contenido?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Lista completa de fuentes citadas para reemplazar las de la versión',
    type: () => [FuenteCitaEditorialDto],
  })
  @IsOptional()
  @IsArray({ message: 'fuentes debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => FuenteCitaEditorialDto)
  fuentes?: FuenteCitaEditorialDto[];
}
