import { Transform } from 'class-transformer';
import { IsIn, IsString, MinLength } from 'class-validator';
import type { TipoDocumentoLegal } from './consultar-aviso-legal.dto.js';

export class PublicarVersionDocumentoDto {
  @IsIn(['aviso_privacidad', 'terminos', 'consentimiento'], {
    message: 'tipo debe ser aviso_privacidad, terminos o consentimiento',
  })
  tipo!: TipoDocumentoLegal;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'texto debe ser una cadena de texto' })
  @MinLength(10, { message: 'texto debe tener al menos 10 caracteres' })
  texto!: string;
}
