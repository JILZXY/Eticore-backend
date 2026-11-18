import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class Confirmar2faDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo_totp?: string;
}
