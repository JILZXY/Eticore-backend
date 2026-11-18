import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { TipoUnidad } from '../../../shared/validation/content-validator.service.js';

export class CrearUnidadEditorialDto {
  @ApiProperty({
    description: 'Tipo de unidad educativa',
    enum: ['aprende', 'normamatch', 'casotech'],
    example: 'normamatch',
  })
  @IsIn(['aprende', 'normamatch', 'casotech'], {
    message: 'tipo debe ser aprende, normamatch o casotech',
  })
  tipo!: TipoUnidad;

  @ApiPropertyOptional({
    description: 'Indica si la unidad publicada es accesible como muestra pública sin sesión',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'muestra_publica debe ser booleano' })
  muestra_publica?: boolean;
}
