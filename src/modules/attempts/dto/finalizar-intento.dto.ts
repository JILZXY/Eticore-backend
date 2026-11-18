import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { DecisionPasoDto } from './guardar-paso.dto.js';

export class FinalizarIntentoDto {
  @IsOptional()
  @IsInt({ message: 'revision debe ser un entero positivo' })
  @Min(1)
  revision?: number;

  @IsOptional()
  @IsString()
  seccion_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secciones_visitadas?: string[];

  @IsOptional()
  @IsBoolean()
  confirmado?: boolean;

  @IsOptional()
  @IsObject()
  asociaciones?: Record<string, string>;

  @IsOptional()
  @IsString()
  etapa_id?: string;

  @IsOptional()
  @IsString()
  alternativa_id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionPasoDto)
  decisiones?: DecisionPasoDto[];

  @IsOptional()
  @IsObject()
  recorrido?: Record<string, unknown>;
}
