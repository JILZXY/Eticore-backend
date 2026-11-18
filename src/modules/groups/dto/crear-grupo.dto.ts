import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CrearGrupoDto {
  @ApiProperty({
    description: 'Nombre del grupo (máximo 120 caracteres)',
    example: 'Grupo 7A — Ética TI',
    maxLength: 120,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'nombre debe ser una cadena de texto' })
  @MinLength(1, { message: 'nombre no puede estar vacío' })
  @MaxLength(120, { message: 'nombre no puede exceder 120 caracteres' })
  nombre!: string;

  @ApiProperty({
    description: 'Periodo académico o identificador de cohorte (máximo 64 caracteres)',
    example: '2026-2',
    maxLength: 64,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'periodo debe ser una cadena de texto' })
  @MinLength(1, { message: 'periodo no puede estar vacío' })
  @MaxLength(64, { message: 'periodo no puede exceder 64 caracteres' })
  periodo!: string;
}
