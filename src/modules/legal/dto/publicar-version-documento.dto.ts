import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MinLength } from 'class-validator';
import type { TipoDocumentoLegal } from './consultar-aviso-legal.dto.js';

export class PublicarVersionDocumentoDto {
  @ApiProperty({
    description: 'Tipo de documento legal a publicar',
    enum: ['aviso_privacidad', 'terminos', 'consentimiento'],
    example: 'aviso_privacidad',
  })
  @IsIn(['aviso_privacidad', 'terminos', 'consentimiento'], {
    message: 'tipo debe ser aviso_privacidad, terminos o consentimiento',
  })
  tipo!: TipoDocumentoLegal;

  @ApiProperty({
    description:
      'Texto íntegro de la versión legal (mínimo 10 caracteres; se calcula huella SHA-256 en servidor)',
    example:
      '[PROTOTIPO SINTÉTICO RN-30] Versión actualizada del aviso de privacidad de ejemplo.',
    minLength: 10,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'texto debe ser una cadena de texto' })
  @MinLength(10, { message: 'texto debe tener al menos 10 caracteres' })
  texto!: string;
}
