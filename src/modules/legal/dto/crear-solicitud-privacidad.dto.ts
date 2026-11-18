import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearSolicitudPrivacidadDto {
  @ApiProperty({
    description: 'Tipo de solicitud de privacidad (p. ej. acceso, rectificacion, cancelacion, oposicion, supresion)',
    example: 'acceso',
    minLength: 2,
    maxLength: 32,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'tipo debe ser una cadena de texto' })
  @MinLength(2, { message: 'tipo debe tener al menos 2 caracteres' })
  @MaxLength(32, { message: 'tipo no puede exceder 32 caracteres' })
  tipo!: string;

  @ApiPropertyOptional({
    description:
      'Nota de verificación mínima sin adjuntar identificaciones ni imágenes en base64 (RN-12)',
    example: 'Confirmación mediante sesión autenticada vigente',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  verificacion_minima?: string;
}
