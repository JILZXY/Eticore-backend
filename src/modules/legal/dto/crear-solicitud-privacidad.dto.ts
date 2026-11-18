import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CrearSolicitudPrivacidadDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'tipo debe ser una cadena de texto' })
  @MinLength(2, { message: 'tipo debe tener al menos 2 caracteres' })
  @MaxLength(32, { message: 'tipo no puede exceder 32 caracteres' })
  tipo!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  verificacion_minima?: string;
}
