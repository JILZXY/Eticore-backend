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
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'revision_esperada debe ser un entero positivo' })
  @Min(1)
  revision_esperada?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'titulo debe ser una cadena de texto' })
  @MinLength(1, { message: 'titulo no puede estar vacío' })
  @MaxLength(200, { message: 'titulo no puede exceder 200 caracteres' })
  titulo?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'descripcion debe ser una cadena de texto' })
  @MinLength(1, { message: 'descripcion no puede estar vacía' })
  descripcion?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'tema_id debe ser un entero positivo' })
  @Min(1)
  tema_id?: number;

  @IsOptional()
  @IsIn(['basico', 'intermedio', 'especializado'], {
    message: 'dificultad debe ser basico, intermedio o especializado',
  })
  dificultad?: DificultadUnidad;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'esquema_version debe ser un entero positivo' })
  @Min(1)
  esquema_version?: number;

  @IsOptional()
  @IsObject({ message: 'contenido debe ser un objeto JSON' })
  contenido?: Record<string, unknown>;

  @IsOptional()
  @IsArray({ message: 'fuentes debe ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => FuenteCitaEditorialDto)
  fuentes?: FuenteCitaEditorialDto[];
}
