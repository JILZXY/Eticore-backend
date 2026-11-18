import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class Confirmar2faDto {
  @ApiPropertyOptional({
    description: 'Primer código TOTP generado por la app autenticadora (6 u 8 dígitos)',
    example: '123456',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo?: string;

  @ApiPropertyOptional({
    description: 'Alias de codigo para confirmar el alta de 2FA',
    example: '123456',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo_totp?: string;
}
