import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({
    description: 'Revisión optimista esperada del intento',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsInt({ message: 'revision debe ser un entero positivo' })
  @Min(1)
  revision?: number;

  @ApiPropertyOptional({
    description: 'Última sección visitada en Aprende al finalizar',
    example: 's1',
  })
  @IsOptional()
  @IsString()
  seccion_id?: string;

  @ApiPropertyOptional({
    description: 'Todas las secciones visitadas en Aprende',
    type: [String],
    example: ['s1', 's2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secciones_visitadas?: string[];

  @ApiPropertyOptional({
    description: 'Confirmación explícita obligatoria para completar Aprende (RN-20)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  confirmado?: boolean;

  @ApiPropertyOptional({
    description: 'Conjunto completo de asociaciones situacion_id -> opcion_id para NormaMatch',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { sit1: 'op1', sit2: 'op2' },
  })
  @IsOptional()
  @IsObject()
  asociaciones?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Etapa de la última decisión en CasoTech',
    example: 'et-2',
  })
  @IsOptional()
  @IsString()
  etapa_id?: string;

  @ApiPropertyOptional({
    description: 'Última alternativa elegida que conduce a etapa terminal en CasoTech',
    example: 'alt-2',
  })
  @IsOptional()
  @IsString()
  alternativa_id?: string;

  @ApiPropertyOptional({
    description: 'Ruta completa de decisiones hasta etapa terminal en CasoTech',
    type: () => [DecisionPasoDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionPasoDto)
  decisiones?: DecisionPasoDto[];

  @ApiPropertyOptional({
    description: 'Recorrido adicional si se envía junto con la finalización',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  recorrido?: Record<string, unknown>;
}
