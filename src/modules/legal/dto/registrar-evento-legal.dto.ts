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
  @Type(() => Number)
  @IsInt({ message: 'version_documento_id debe ser un entero positivo' })
  @Min(1)
  version_documento_id!: number;

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

  @IsUUID('4', { message: 'clave_operacion debe ser un UUID v4 válido' })
  clave_operacion!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  canal?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(64)
  finalidad_codigo?: string;
}
