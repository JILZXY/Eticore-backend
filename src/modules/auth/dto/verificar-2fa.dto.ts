import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class Verificar2faDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'desafio_id debe ser texto' })
  @IsNotEmpty({ message: 'desafio_id es obligatorio' })
  desafio_id: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo_totp?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo?: string;
}
