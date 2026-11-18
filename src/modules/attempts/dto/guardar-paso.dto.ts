import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

export class DecisionPasoDto {
  @ApiProperty({
    description: 'Identificador de la etapa en el grafo CasoTech',
    example: 'et-1',
  })
  @IsString()
  etapa_id: string;

  @ApiProperty({
    description: 'Identificador de la alternativa elegida',
    example: 'alt-1',
  })
  @IsString()
  alternativa_id: string;
}

export class GuardarPasoDto {
  @ApiProperty({
    description:
      'Número de revisión optimista actual del intento (409 si la revisión no coincide)',
    example: 1,
    minimum: 1,
  })
  @IsInt({ message: 'revision debe ser un entero positivo' })
  @Min(1)
  revision: number;

  @ApiPropertyOptional({
    description: 'Sección visitada en unidad Aprende',
    example: 's1',
  })
  @IsOptional()
  @IsString()
  seccion_id?: string;

  @ApiPropertyOptional({
    description: 'Lista de secciones visitadas en unidad Aprende',
    type: [String],
    example: ['s1', 's2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  secciones_visitadas?: string[];

  @ApiPropertyOptional({
    description: 'Confirmación explícita de lectura en Aprende (RN-20)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  confirmado?: boolean;

  @ApiPropertyOptional({
    description: 'Mapa situacion_id -> opcion_id para NormaMatch',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { sit1: 'op1' },
  })
  @IsOptional()
  @IsObject()
  asociaciones?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Etapa actual en CasoTech (opcional; el servidor valida la etapa esperada)',
    example: 'et-1',
  })
  @IsOptional()
  @IsString()
  etapa_id?: string;

  @ApiPropertyOptional({
    description: 'Alternativa elegida para la etapa actual en CasoTech',
    example: 'alt-1',
  })
  @IsOptional()
  @IsString()
  alternativa_id?: string;

  @ApiPropertyOptional({
    description: 'Secuencia de decisiones en CasoTech',
    type: () => [DecisionPasoDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DecisionPasoDto)
  decisiones?: DecisionPasoDto[];

  @ApiPropertyOptional({
    description: 'Objeto de recorrido parcial (validado por el servidor)',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  recorrido?: Record<string, unknown>;
}
