import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CrearIntentoDto {
  @ApiPropertyOptional({
    description:
      'UUID v4 generado antes del primer envío para garantizar idempotencia (RN-05)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El id del intento debe ser un UUID v4 válido' })
  id?: string;

  @ApiProperty({
    description: 'Identificador de la unidad formativa publicada a cursar',
    example: 1,
  })
  @IsInt({ message: 'unidad_id debe ser un entero positivo' })
  @Min(1)
  unidad_id: number;
}
