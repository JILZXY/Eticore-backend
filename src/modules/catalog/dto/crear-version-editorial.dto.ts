import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { DificultadUnidad } from './consultar-catalogo.dto.js';

export class FuenteCitaEditorialDto {
  @ApiProperty({
    description: 'Clave local de la referencia citada en el contenido JSONB (p. ej. REF1)',
    example: 'REF1',
    maxLength: 40,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'clave_local debe ser una cadena de texto' })
  @MinLength(1, { message: 'clave_local no puede estar vacía' })
  @MaxLength(40, { message: 'clave_local no puede exceder 40 caracteres' })
  clave_local!: string;

  @ApiProperty({
    description: 'Identificador de la edición inmutable en fuente_version',
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'fuente_version_id debe ser un entero positivo' })
  @Min(1)
  fuente_version_id!: number;

  @ApiProperty({
    description: 'Fecha en que se verificó la vigencia de la fuente (ISO 8601 YYYY-MM-DD)',
    example: '2026-11-18',
  })
  @IsISO8601(
    { strict: true },
    { message: 'revisada_en debe tener formato fecha ISO 8601 válido' },
  )
  revisada_en!: string;
}

export class CrearVersionEditorialDto {
  @ApiProperty({
    description: 'Identificador de la unidad a la que pertenece el nuevo borrador',
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'unidad_id debe ser un entero positivo' })
  @Min(1)
  unidad_id!: number;

  @ApiProperty({
    description: 'Título de la versión (máximo 200 caracteres)',
    example: 'Minimización de Datos en Bitácoras',
    maxLength: 200,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'titulo debe ser una cadena de texto' })
  @MinLength(1, { message: 'titulo no puede estar vacío' })
  @MaxLength(200, { message: 'titulo no puede exceder 200 caracteres' })
  titulo!: string;

  @ApiProperty({
    description: 'Descripción de la unidad formativa',
    example: 'Actividad sobre principios de privacidad y protección de credenciales.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'descripcion debe ser una cadena de texto' })
  @MinLength(1, { message: 'descripcion no puede estar vacía' })
  descripcion!: string;

  @ApiProperty({
    description: 'Identificador del tema en el catálogo',
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'tema_id debe ser un entero positivo' })
  @Min(1)
  tema_id!: number;

  @ApiProperty({
    description: 'Nivel de dificultad',
    enum: ['basico', 'intermedio', 'especializado'],
    example: 'basico',
  })
  @IsIn(['basico', 'intermedio', 'especializado'], {
    message: 'dificultad debe ser basico, intermedio o especializado',
  })
  dificultad!: DificultadUnidad;

  @ApiPropertyOptional({
    description: 'Versión del esquema JSON del contenido (por defecto 1)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'esquema_version debe ser un entero positivo' })
  @Min(1)
  esquema_version?: number;

  @ApiProperty({
    description: 'Documento JSONB del contenido según (tipo, esquema_version), máximo 1 MiB',
    type: 'object',
    additionalProperties: true,
    example: {
      situaciones: [
        {
          id: 's1',
          enunciado: 'Evaluación de logs en producción',
          opciones: [
            { id: 'op1', texto: 'Omitir contraseñas y tokens' },
            { id: 'op2', texto: 'Registrar el cuerpo completo' },
          ],
          respuesta_correcta: 'op1',
          explicacion: 'RN-17 prohíbe registrar secretos en claro.',
          referencia_local: 'REF1',
        },
      ],
    },
  })
  @IsObject({ message: 'contenido debe ser un objeto JSON' })
  contenido!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Referencias locales de fuentes asociadas a esta versión',
    type: () => [FuenteCitaEditorialDto],
  })
  @IsOptional()
  @IsArray({ message: 'fuentes debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => FuenteCitaEditorialDto)
  fuentes?: FuenteCitaEditorialDto[];
}
