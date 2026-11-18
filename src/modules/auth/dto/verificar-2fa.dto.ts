import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class Verificar2faDto {
  @ApiProperty({
    description:
      'Token opaco del desafío de 5 minutos emitido por POST /api/v1/auth/login (HTTP 202)',
    example: 'a1b2c3d4e5f6...',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'desafio_id debe ser texto' })
  @IsNotEmpty({ message: 'desafio_id es obligatorio' })
  desafio_id: string;

  @ApiPropertyOptional({
    description: 'Código TOTP vigente de 6 u 8 dígitos',
    example: '123456',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo_totp?: string;

  @ApiPropertyOptional({
    description: 'Alias de codigo_totp (código TOTP de 6 u 8 dígitos)',
    example: '123456',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^\d{6,8}$/, { message: 'El código TOTP debe tener 6 u 8 dígitos' })
  codigo?: string;
}
