import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Min } from 'class-validator';

export class AgregarIntegranteGrupoDto {
  @ApiProperty({
    description: 'Identificador del usuario a incorporar al grupo',
    example: 5,
  })
  @Type(() => Number)
  @IsInt({ message: 'usuario_id debe ser un entero positivo' })
  @Min(1)
  usuario_id!: number;

  @ApiPropertyOptional({
    description:
      'Inicio del intervalo semiabierto [ingreso, salida) en formato ISO 8601 UTC (por defecto instante actual)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'ingreso debe tener formato ISO 8601 válido' },
  )
  ingreso?: string;

  @ApiPropertyOptional({
    description:
      'Fin del intervalo semiabierto [ingreso, salida) en formato ISO 8601 UTC (si se omite, membresía abierta)',
    example: '2026-12-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'salida debe tener formato ISO 8601 válido' },
  )
  salida?: string;
}
