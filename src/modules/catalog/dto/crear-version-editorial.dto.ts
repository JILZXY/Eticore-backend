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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'clave_local debe ser una cadena de texto' })
  @MinLength(1, { message: 'clave_local no puede estar vacía' })
  @MaxLength(40, { message: 'clave_local no puede exceder 40 caracteres' })
  clave_local!: string;

  @Type(() => Number)
  @IsInt({ message: 'fuente_version_id debe ser un entero positivo' })
  @Min(1)
  fuente_version_id!: number;

  @IsISO8601(
    { strict: true },
    { message: 'revisada_en debe tener formato fecha ISO 8601 válido' },
  )
  revisada_en!: string;
}

export class CrearVersionEditorialDto {
  @Type(() => Number)
  @IsInt({ message: 'unidad_id debe ser un entero positivo' })
  @Min(1)
  unidad_id!: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'titulo debe ser una cadena de texto' })
  @MinLength(1, { message: 'titulo no puede estar vacío' })
  @MaxLength(200, { message: 'titulo no puede exceder 200 caracteres' })
  titulo!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'descripcion debe ser una cadena de texto' })
  @MinLength(1, { message: 'descripcion no puede estar vacía' })
  descripcion!: string;

  @Type(() => Number)
  @IsInt({ message: 'tema_id debe ser un entero positivo' })
  @Min(1)
  tema_id!: number;

  @IsIn(['basico', 'intermedio', 'especializado'], {
    message: 'dificultad debe ser basico, intermedio o especializado',
  })
  dificultad!: DificultadUnidad;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'esquema_version debe ser un entero positivo' })
  @Min(1)
  esquema_version?: number;

  @IsObject({ message: 'contenido debe ser un objeto JSON' })
  contenido!: Record<string, unknown>;

  @IsOptional()
  @IsArray({ message: 'fuentes debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => FuenteCitaEditorialDto)
  fuentes?: FuenteCitaEditorialDto[];
}
