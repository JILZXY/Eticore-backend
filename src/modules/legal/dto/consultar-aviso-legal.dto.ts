import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export type TipoDocumentoLegal =
  | 'aviso_privacidad'
  | 'terminos'
  | 'consentimiento';

export class ConsultarAvisoLegalDto {
  @ApiPropertyOptional({
    description: 'Tipo de documento legal a consultar (por defecto aviso_privacidad)',
    enum: ['aviso_privacidad', 'terminos', 'consentimiento'],
    default: 'aviso_privacidad',
    example: 'aviso_privacidad',
  })
  @IsOptional()
  @IsIn(['aviso_privacidad', 'terminos', 'consentimiento'], {
    message: 'tipo debe ser aviso_privacidad, terminos o consentimiento',
  })
  tipo?: TipoDocumentoLegal;
}
