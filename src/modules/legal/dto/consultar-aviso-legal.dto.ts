import { IsIn, IsOptional } from 'class-validator';

export type TipoDocumentoLegal =
  | 'aviso_privacidad'
  | 'terminos'
  | 'consentimiento';

export class ConsultarAvisoLegalDto {
  @IsOptional()
  @IsIn(['aviso_privacidad', 'terminos', 'consentimiento'], {
    message: 'tipo debe ser aviso_privacidad, terminos o consentimiento',
  })
  tipo?: TipoDocumentoLegal;
}
