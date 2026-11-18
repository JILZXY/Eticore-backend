import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export type TipoEventoLegal =
  | 'aviso_presentado'
  | 'terminos_aceptados'
  | 'consentimiento_otorgado'
  | 'consentimiento_retirado'
  | 'consentimiento_rechazado';

export class RegistrarEventoLegalDto {
  @ApiProperty({
    description: 'Identificador de la versión exacta en version_documento',
    example: 1,
  })
  @Type(() => Number)
  @IsInt({ message: 'version_documento_id debe ser un entero positivo' })
  @Min(1)
  version_documento_id!: number;

  @ApiProperty({
    description: 'Tipo de evento legal registrado',
    enum: [
      'aviso_presentado',
      'terminos_aceptados',
      'consentimiento_otorgado',
      'consentimiento_retirado',
      'consentimiento_rechazado',
    ],
    example: 'terminos_aceptados',
  })
  @IsIn(
    [
      'aviso_presentado',
      'terminos_aceptados',
      'consentimiento_otorgado',
      'consentimiento_retirado',
      'consentimiento_rechazado',
    ],
    { message: 'tipo_evento no es válido' },
  )
  tipo_evento!: TipoEventoLegal;

  @ApiProperty({
    description: 'Clave de operación UUID v4 para garantizar idempotencia por usuario',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'clave_operacion debe ser un UUID v4 válido' })
  clave_operacion!: string;

  @ApiPropertyOptional({
    description: 'Canal de origen del evento (por defecto web)',
    example: 'web',
    default: 'web',
    maxLength: 32,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  canal?: string;

  @ApiPropertyOptional({
    description: 'Código de finalidad asociada al consentimiento (cuando aplica)',
    example: 'metricas_academicas',
    maxLength: 64,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(64)
  finalidad_codigo?: string;
}
